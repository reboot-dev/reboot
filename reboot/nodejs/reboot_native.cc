#include <pybind11/embed.h>
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#if __linux__
#include <sys/eventfd.h>
#endif

#include <atomic>
#include <future>
#include <iostream>
#include <list>
#include <map>
#include <mutex>
#include <regex>
#include <sstream>
#include <thread>
#include <vector>

#define NODE_ADDON_API_ENABLE_TYPE_CHECK_ON_AS
#include "napi.h"

using namespace pybind11::literals;

namespace py = pybind11;


// Helper when debugging, left for future optimization work.
struct Timer {
  Timer(const char* name) : name_(name) {
    start_ = std::chrono::high_resolution_clock::now();
  }

  void elapsed(const char* step = nullptr) const {
    auto end = std::chrono::high_resolution_clock::now();
    auto duration =
        std::chrono::duration_cast<std::chrono::milliseconds>(end - start_);
    std::stringstream ss;
    ss << name_
       << (step != nullptr ? " at " + std::string(step) : std::string(""))
       << " took " << duration.count() << "ms" << std::endl;
    std::cout << ss.str();
  }

  std::string name_;
  std::chrono::time_point<std::chrono::high_resolution_clock> start_;
};


void _RunNodeFunctions(
    Napi::Env env,
    Napi::Function /* callback */,
    void* /* context */,
    void* /* data */);


struct PythonNodeAdaptor {
  PythonNodeAdaptor() {
#if __linux__
    read_fd_ = write_fd_ = eventfd(0, EFD_NONBLOCK | EFD_CLOEXEC);
#else
    int pipe_fds[2];
    if (pipe(pipe_fds) == -1) {
      perror("pipe(...)");
      abort();
    }

    // TODO: make nonblocking and close on exec.
    read_fd_ = pipe_fds[0];
    write_fd_ = pipe_fds[1];
#endif
  }

  ~PythonNodeAdaptor() {
    // We must join because thread captures `this`.
    thread.join();
  }

  // NOTE: this is defined below because it relies on `adaptor`, our
  // static instance of `PythonNodeAdaptor`.
  void Initialize(Napi::Env& env, const Napi::Function& js_callback);

  static void HandleException(const std::exception& e) {
    // First determine if the exception was thrown from Python or C++.
    if (const py::error_already_set* e_py =
            dynamic_cast<const py::error_already_set*>(&e)) {
      // This is a Python exception. Is it an `InputError`?
      if (e_py->matches(
              py::module::import("reboot.aio.exceptions").attr("InputError"))) {
        // This is an InputError, which means it reports a mistake in the input
        // provided by the developer. We want to print _only_ the user-friendly
        // error message in the exception, without intimidating stack traces.
        //
        // Calling `e_py->what()` would produce a stack trace, so we get only
        // the user-friendly message by stringifying in Python-land instead.
        std::string what = py::str(e_py->value());
        std::cerr << what << std::endl;
      } else {
        // This is an internal error from the Python library. Request that the
        // developer reports the issue, and give them the full stack trace to
        // help diagnose the problem.
        std::cerr << "Unexpected library exception: " << e_py->what()
                  << std::endl
                  << "Please report this bug to the maintainers!" << std::endl;
      }
    } else {
      // This is a C++ exception; something went wrong in the C++ code. Request
      // that the developer reports the issue.
      std::cerr << "Unexpected adapter exception: " << e.what() << std::endl
                << "Please report this bug to the maintainers!" << std::endl;
    }
  }

  template <typename F>
  void ScheduleCallbackOnPythonEventLoop(F&& f, bool high_priority = true) {
    bool signal_fd = false;

    {
      std::lock_guard<std::mutex> lock(mutex);
      python_functions.emplace_back(std::move(f));
      if (high_priority && should_signal_fd_) {
        signal_fd = true;
        should_signal_fd_ = false;
      }
    }

    if (signal_fd) {
      uint64_t one = 1;
      // Writing to this file descriptor communicates to Python
      // (see `public/reboot/nodejs/python.py`) that
      // `run_functions()` should be called (while holding the Python
      // GIL). In `Initialize()` we've set up `run_functions()` to run
      // the `python_functions` we've just added our callback to.
      if (write(write_fd_, &one, sizeof(one)) < 0) {
        perror("write(...)");
        abort();
      }
    }
  }

  template <typename F>
  void ScheduleCallbackOnPythonEventLoopLowPriority(F&& f) {
    return ScheduleCallbackOnPythonEventLoop(
        std::move(f),
        /* high_priority = */ false);
  }

  template <typename F>
  void ScheduleCallbackOnNodeEventLoop(F&& f, bool high_priority = true) {
    // It is possible that Node.js is shutting down and has already
    // called the `thread_safe_function` finalizer and trying to use
    // `thread_safe_function` will raise SIGABRT or SIGSEGV.
    //
    // Given that we're shutting down we just return!
    //
    // If the callback is to free memory, e.g., from a
    // `NapiSafeReference`, that's not a problem because we're
    // shutting down so all the memory will get freed then! ;-)
    //
    // If this is for some other critical function that is necessary
    // to do _before_ shutting down then we'll need to rethink this
    // approaach.
    if (thread_safe_function_finalized) {
      return;
    }

    bool call_thread_safe_function = false;

    {
      std::lock_guard<std::mutex> lock(node_functions_mutex_);
      node_functions_.emplace_back(std::move(f));
      if (high_priority && should_call_thread_safe_function_) {
        call_thread_safe_function = true;
        should_call_thread_safe_function_ = false;
      }
    }

    if (call_thread_safe_function) {
      napi_status status = thread_safe_function.BlockingCall();

      // TODO: handle each of the possible values for `status`:
      //
      // napi_ok: the call was successfully added to the queue.
      //
      // napi_queue_full: the queue was full when trying to call in a
      //                  non-blocking method.
      //
      // napi_closing: the thread-safe function is aborted and cannot
      //               accept more calls.
      //
      // napi_invalid_arg: the thread-safe function is closed.
      //
      // napi_generic_failure: a generic error occurred when attempting
      //

      if (status != napi_ok) {
        Napi::Error::Fatal(
            "ThreadEntry",
            "Napi::ThreadSafeNapi::Function.BlockingCall() failed");
      }
    }
  }

  template <typename F>
  void ScheduleCallbackOnNodeEventLoopLowPriority(F&& f) {
    return ScheduleCallbackOnNodeEventLoop(
        std::move(f),
        /* high_priority = */ false);
  }

  void RunNodeFunctions(Napi::Env& env) {
    std::list<std::function<void(Napi::Env&)>> functions;
    {
      std::lock_guard<std::mutex> lock(node_functions_mutex_);
      functions = std::move(node_functions_);
      should_call_thread_safe_function_ = true;
    }
    for (auto&& function : functions) {
      try {
        function(env);
      } catch (const std::exception& e) {
        std::cerr << "Unexpected exception: " << e.what() << "\n"
                  << "Please report this bug to the maintainers!" << std::endl;
      }
    }
  }

  void KeepNodeFromExiting(Napi::Env env) {
    if (references.fetch_add(1, std::memory_order_acq_rel) == 0) {
      // Call `Ref()` on our NAPI thread safe function so that it
      // can't be cleaned up and thus we won't exit.
      //
      // NOTE: `Ref()` and `Unref()` will just set and unset an
      // "is_referenced" boolean flag, rather than incrementing and
      // decrementing a reference count, hence we do the atomic
      // reference counting ourselves.
      thread_safe_function.Ref(env);
    }
  }

  void AllowNodeToExit(Napi::Env env) {
    if (references.fetch_sub(1, std::memory_order_acq_rel) == 1) {
      // Call `Unref()` on our NAPI thread safe function so that it
      // can be cleaned up and we can exit.
      //
      // NOTE: `Ref()` and `Unref()` will just set and unset an
      // "is_referenced" boolean flag, rather than incrementing and
      // decrementing a reference count, hence we do the atomic
      // reference counting ourselves.
      thread_safe_function.Unref(env);
    }
  }

  // Reference counting to keep Node from exiting when we're calling
  // into Python or expecting calls from Python.
  std::atomic<int> references{0};

  Napi::TypedThreadSafeFunction<void, void, _RunNodeFunctions>
      thread_safe_function;
  std::mutex node_functions_mutex_;
  std::list<std::function<void(Napi::Env&)>> node_functions_;
  bool should_call_thread_safe_function_ = true;

  bool thread_safe_function_finalized = false;

  std::thread thread;
  std::mutex mutex;
  std::list<std::function<void()>> python_functions;
  int read_fd_ = -1;
  int write_fd_ = -1;
  bool should_signal_fd_ = true;
};


static PythonNodeAdaptor* adaptor = new PythonNodeAdaptor();

// References to nodejs functions so we don't have to look them up.
static Napi::FunctionReference* js_launchSubprocessServer =
    new Napi::FunctionReference();


struct NapiReferenceDeleter {
  template <typename T>
  void operator()(Napi::Reference<T>* reference) {
    adaptor->ScheduleCallbackOnNodeEventLoopLowPriority(
        [reference](Napi::Env) { delete reference; });
  }
};


template <typename T>
class NapiSafeReference {
 public:
  NapiSafeReference(T t)
    : _reference(
          new Napi::Reference<T>(Napi::Persistent(std::move(t))),
          NapiReferenceDeleter()) {}

  NapiSafeReference(Napi::Reference<T>&& reference)
    : _reference(
          new Napi::Reference<T>(std::move(reference)),
          NapiReferenceDeleter()) {}

  // Helper for getting the value of the reference. We require a
  // `Napi::Env` to ensure we only try and get the value from within a
  // Node thread (e.g., using the main thread or from within a NAPI
  // thread safe function).
  T Value(Napi::Env) const {
    return _reference->Value();
  }

 private:
  std::shared_ptr<Napi::Reference<T>> _reference;
};

using NapiSafeFunctionReference = NapiSafeReference<Napi::Function>;
using NapiSafeObjectReference = NapiSafeReference<Napi::Object>;

// For every servicer we construct a _subclass_ of our Python
// generated Node adaptor, e.g., `GreeterServicerNodeAdaptor`, _at
// runtime_ which we add to the following Python module. This module
// also includes our C++ <-> Python class wrappers for storing NAPI
// objects in Python to properly handle memory management.
PYBIND11_EMBEDDED_MODULE(reboot_native, m) {
  py::class_<NapiSafeFunctionReference>(m, "NapiSafeFunctionReference");

  py::class_<NapiSafeObjectReference>(m, "NapiSafeObjectReference");
}


Napi::External<py::object> make_napi_external(
    Napi::Env env,
    py::object* py_object,
    const napi_type_tag* type_tag = nullptr) {
  auto js_external = Napi::External<py::object>::New(
      env,
      py_object,
      [](Napi::Env, py::object* py_object) {
        adaptor->ScheduleCallbackOnPythonEventLoopLowPriority(
            [py_object]() { delete py_object; });
      });

  if (type_tag != nullptr) {
    js_external.TypeTag(type_tag);
  }

  return js_external;
}


void _RunNodeFunctions(
    Napi::Env env,
    Napi::Function /* callback */,
    void* /* context */,
    void* /* data */) {
  adaptor->RunNodeFunctions(env);
}


void PythonNodeAdaptor::Initialize(
    Napi::Env& env,
    const Napi::Function& js_callback) {
  thread_safe_function =
      Napi::TypedThreadSafeFunction<void, void, _RunNodeFunctions>::New(
          /* Environment: */
          env,
          /* JS callback: */ js_callback,
          /* Resource name: */ "reboot_native",
          /* Max queue size (0 = unlimited): */ 0,
          /* Initial thread count: */ 1,
          /* Context: */ (void*) nullptr,
          // Finalizer:
          [this](Napi::Env env, void*, void*) {
            // Set that we've been finalized so that we don't use
            // `thread_safe_function` again, see comment in
            // `ScheduleCallbackOnNodeEventLoop`.
            thread_safe_function_finalized = true;
          },
          /* Finalizer data: */ (void*) nullptr);

  // We start with our thread safe function unreferenced so that
  // if the user's code never calls into us we won't keep Node
  // from exiting.
  thread_safe_function.Unref(env);

  thread = std::thread([this]() {
    // Set environment variables _before_ initializing the
    // interpreter because it may cache the variables. Also, some
    // of the variables need to be set before we start importing
    // anything.
    //
    // Don't try and manipulate signals when running within Node!
    setenv("REBOOT_SIGNALS_AVAILABLE", "false", 1);
    // Specify that we are running from within `node`.
    setenv("REBOOT_NODEJS", "true", 1);

    py::initialize_interpreter();

    try {
      py::object module = py::module::import("reboot.nodejs.python");

      module.attr("launch_subprocess_server") =
          py::cpp_function([](py::str py_base64_args) {
            py::object py_future =
                py::module::import("asyncio").attr("Future")();

            adaptor->ScheduleCallbackOnNodeEventLoop(
                [base64_args = std::string(py_base64_args),
                 py_future = new py::object(py_future)](Napi::Env env) {
                  try {
                    Napi::Number js_pid =
                        js_launchSubprocessServer
                            ->Call({Napi::String::New(env, base64_args)})
                            .As<Napi::Number>();

                    adaptor->ScheduleCallbackOnPythonEventLoop(
                        [py_future, pid = js_pid.Int64Value()]() {
                          bool cancelled =
                              py_future->attr("cancelled")().cast<bool>();
                          if (!cancelled) {
                            py_future->attr("set_result")(pid);
                          }
                          delete py_future;
                        });
                  } catch (const Napi::Error& e) {
                    adaptor->ScheduleCallbackOnPythonEventLoop(
                        [py_future, what = e.what()]() {
                          bool cancelled =
                              py_future->attr("cancelled")().cast<bool>();
                          if (!cancelled) {
                            py_future->attr("set_exception")(
                                py::module::import("builtins")
                                    .attr("Exception")(what));
                          }
                          delete py_future;
                        });
                  }
                });

            return py_future;
          });

      module.attr("run_functions") = py::cpp_function([this]() {
        std::list<std::function<void()>> functions;
        std::vector<std::pair<py::object*, std::string>> futures;

        {
          std::unique_lock<std::mutex> lock(mutex);
          functions = std::move(python_functions);
          should_signal_fd_ = true;
        }

        for (auto&& function : functions) {
          try {
            function();
          } catch (std::exception& e) {
            PythonNodeAdaptor::HandleException(e);
          }
        }
      });

      py::object event_loop_thread = module.attr("EventLoopThread")(read_fd_);

      py::gil_scoped_release release;

      while (true) {
        std::this_thread::sleep_until(
            std::chrono::time_point<std::chrono::system_clock>::max());
        continue;
      }
    } catch (const std::exception& e) {
      std::cout << e.what() << std::endl;
      throw;
    }
  });
}


py::str py_exception_str(const py::object& exception) {
  py::str exception_string =
      py::str("{exception}").attr("format")("exception"_a = exception);

  py::str type_name_string =
      py::str("{type_name}")
          .attr("format")(
              "type_name"_a = exception.get_type().attr("__name__"));

  if (exception_string.equal(py::str(""))) {
    return type_name_string;
  }

  return py::str("{type_name_string}: {exception_string}")
      .attr("format")(
          "type_name_string"_a = type_name_string,
          "exception_string"_a = exception_string);
}


// Helper that returns a message string based on the caught `Error`.
std::string message_from_js_error(const Napi::Object& js_error) {
  std::string result;

  if (!js_error.Get("name").IsUndefined()) {
    std::string name = js_error.Get("name").As<Napi::String>().Utf8Value();

    if (name != "Error") {
      result += name;
    }
  }

  std::string message = js_error.Get("message").As<Napi::String>().Utf8Value();

  // Trim leading and trailing whitespace.
  message = std::regex_replace(message, std::regex("^\\s+"), "");
  message = std::regex_replace(message, std::regex("\\s+$"), "");

  if (message != "") {
    if (result != "") {
      result += ": ";
    }
    result += message;
  }

  return result;
}


template <typename F, typename T = std::invoke_result_t<F>>
T RunCallbackOnPythonEventLoop(F&& f) {
  std::promise<T> promise;

  adaptor->ScheduleCallbackOnPythonEventLoop([&f, &promise]() {
    try {
      if constexpr (std::is_void<T>::value) {
        f();
        promise.set_value();
      } else {
        promise.set_value(f());
      }
    } catch (const std::exception& e) {
      promise.set_exception(
          std::make_exception_ptr(std::runtime_error(e.what())));
    }
  });

  return promise.get_future().get();
}


template <typename F, typename T = std::invoke_result_t<F, Napi::Env>>
T RunCallbackOnNodeEventLoop(F&& f, bool warn = false) {
  std::promise<T> promise;

  adaptor->ScheduleCallbackOnNodeEventLoop(
      [&f, &warn, &promise](Napi::Env env) {
        try {
          if constexpr (std::is_void<T>::value) {
            f(env);
            promise.set_value();
          } else {
            promise.set_value(f(env));
          }
        } catch (const Napi::Error& e) {
          if (warn) {
            env.Global()
                .Get("console")
                .As<Napi::Object>()
                .Get("warn")
                .As<Napi::Function>()
                .Call({e.Value(), Napi::String::New(env, "\n")});
          }
          promise.set_exception(
              std::make_exception_ptr(std::runtime_error(e.what())));
        } catch (const std::exception& e) {
          if (warn) {
            env.Global()
                .Get("console")
                .As<Napi::Object>()
                .Get("warn")
                .As<Napi::Function>()
                .Call(
                    {Napi::String::New(env, e.what()),
                     Napi::String::New(env, "\n")});
          }
          promise.set_exception(
              std::make_exception_ptr(std::runtime_error(e.what())));
        }
      });

  return promise.get_future().get();
}


template <typename PythonCallback, typename NodeCallback>
Napi::Promise NodePromiseFromPythonCallback(
    Napi::Env env,
    PythonCallback&& python_callback,
    NodeCallback&& node_callback) {
  // Keep Node from exiting since we are calling into Python and Node
  // otherwise might not know that outstanding promises that may be
  // being `await`'ed are still being worked on.
  //
  // TODO: if `Application.run()` was called then Node will already
  // not exit so unfortunately this is a noop and worse, the extra
  // callback we attach to the promise via `.then()` below hurts
  // performance. Consider a mechanism in that case and possibly
  // others where we can not do this for better performance but still
  // be correct.
  adaptor->KeepNodeFromExiting(env);

  auto js_deferred = std::make_shared<Napi::Promise::Deferred>(env);
  auto js_promise = js_deferred->Promise();

  adaptor->ScheduleCallbackOnPythonEventLoop(
      [python_callback = std::forward<PythonCallback>(python_callback),
       node_callback = std::forward<NodeCallback>(node_callback),
       js_deferred = std::move(js_deferred)]() mutable {
        try {
          auto result = python_callback();
          adaptor->ScheduleCallbackOnNodeEventLoop(
              [node_callback = std::forward<NodeCallback>(node_callback),
               js_deferred = std::move(js_deferred),
               result = std::move(result)](Napi::Env env) mutable {
                try {
                  js_deferred->Resolve(node_callback(env, std::move(result)));
                } catch (const Napi::Error& e) {
                  js_deferred->Reject(e.Value());
                } catch (const std::exception& e) {
                  // TODO: is this code unreachable because Node.js
                  // will properly always only pass us a `Napi::Error`?
                  js_deferred->Reject(Napi::Error::New(env, e.what()).Value());
                } catch (...) {
                  // TODO: is this code unreachable because Node.js
                  // will properly always only pass us a `Napi::Error`?
                  js_deferred->Reject(
                      Napi::Error::New(env, "Unknown error").Value());
                }
              });
        } catch (pybind11::error_already_set& e) {
          std::string exception = py_exception_str(e.value());
          adaptor->ScheduleCallbackOnNodeEventLoop(
              [js_deferred = std::move(js_deferred),
               exception = std::move(exception)](Napi::Env env) mutable {
                js_deferred->Reject(Napi::Error::New(env, exception).Value());
              });
        }
      });

  // Allow Node to exit after we've resolved or rejected the promise.
  auto js_resolve_reject =
      Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
        adaptor->AllowNodeToExit(info.Env());
      });

  js_promise.Get("then").As<Napi::Function>().Call(
      js_promise,
      {js_resolve_reject, js_resolve_reject});

  return js_promise;
}


template <
    typename PythonFutureCallback,
    typename PythonDoneCallback,
    typename NodeCallback>
Napi::Promise NodePromiseFromPythonFuture(
    std::string&& what,
    Napi::Env env,
    PythonFutureCallback&& python_future_callback,
    PythonDoneCallback&& python_done_callback,
    NodeCallback&& node_callback) {
  // Keep Node from exiting since we are calling into Python and Node
  // otherwise might not know that outstanding promises that may be
  // being `await`'ed are still being worked on.
  //
  // TODO: if `Application.run()` was called then Node will already
  // not exit so unfortunately this is a noop and worse, the extra
  // callback we attach to the promise via `.then()` below hurts
  // performance. Consider a mechanism in that case and possibly
  // others where we can not do this for better performance but still
  // be correct.
  adaptor->KeepNodeFromExiting(env);

  auto js_deferred = std::make_shared<Napi::Promise::Deferred>(env);
  auto js_promise = js_deferred->Promise();

  adaptor->ScheduleCallbackOnPythonEventLoop(
      [python_future_callback =
           std::forward<PythonFutureCallback>(python_future_callback),
       python_done_callback =
           std::forward<PythonDoneCallback>(python_done_callback),
       node_callback = std::forward<NodeCallback>(node_callback),
       js_deferred = std::move(js_deferred)]() mutable {
        try {
          // TODO: check that `py_future` is a future!
          py::object py_future = python_future_callback();

          py_future.attr("add_done_callback")(py::cpp_function(
              [python_done_callback =
                   std::forward<PythonDoneCallback>(python_done_callback),
               node_callback = std::forward<NodeCallback>(node_callback),
               js_deferred = std::move(js_deferred),
               // NOTE: need to keep a reference to `py_future` so that it
               // doesn't get destroyed before completing!
               py_future = new py::object(py_future)](py::object) mutable {
                // Need to check `cancelled()` _first_ because
                // `exception()` will raise if it has been cancelled.
                if (py_future->attr("cancelled")().cast<bool>()) {
                  adaptor->ScheduleCallbackOnNodeEventLoop(
                      [js_deferred = std::move(js_deferred)](Napi::Env env) {
                        js_deferred->Reject(
                            Napi::Error::New(env, "Cancelled").Value());
                      });
                } else {
                  py::object py_exception = py_future->attr("exception")();
                  if (!py_exception.is_none()) {
                    std::string exception = py_exception_str(py_exception);
                    adaptor->ScheduleCallbackOnNodeEventLoop(
                        [js_deferred = std::move(js_deferred),
                         exception = std::move(exception)](Napi::Env env) {
                          js_deferred->Reject(
                              Napi::Error::New(env, exception).Value());
                        });
                  } else {
                    // TODO: try / catch around `python_done_callback`.
                    py::object py_result = py_future->attr("result")();
                    auto result = python_done_callback(std::move(py_result));

                    adaptor->ScheduleCallbackOnNodeEventLoop(
                        [node_callback =
                             std::forward<NodeCallback>(node_callback),
                         js_deferred = std::move(js_deferred),
                         result = std::move(result)](Napi::Env env) mutable {
                          // TODO: try / catch around `node_callback`.
                          auto js_result =
                              node_callback(env, std::move(result));
                          js_deferred->Resolve(js_result);
                        });
                  }
                }
                delete py_future;
              },
              py::arg("future")));
        } catch (pybind11::error_already_set& e) {
          std::string exception = py_exception_str(e.value());
          adaptor->ScheduleCallbackOnNodeEventLoop(
              [js_deferred = std::move(js_deferred),
               exception = std::move(exception)](Napi::Env env) mutable {
                js_deferred->Reject(Napi::Error::New(env, exception).Value());
              });
        }
      });

  // Allow Node to exit after we've resolved or rejected the promise.
  auto js_resolve_reject =
      Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
        adaptor->AllowNodeToExit(info.Env());
      });

  js_promise.Get("then").As<Napi::Function>().Call(
      js_promise,
      {js_resolve_reject, js_resolve_reject});

  return js_promise;
}


template <typename PythonFutureCallback>
Napi::Promise NodePromiseFromPythonFuture(
    std::string&& what,
    Napi::Env env,
    PythonFutureCallback&& python_future_callback) {
  return NodePromiseFromPythonFuture(
      std::move(what),
      env,
      std::forward<PythonFutureCallback>(python_future_callback),
      [](py::object py_result) {
        // TODO: check that `py_result` is `None`.
        return std::nullopt;
      },
      [](Napi::Env env, std::nullopt_t) { return env.Null(); });
}


template <
    typename PythonTaskCallback,
    typename PythonDoneCallback,
    typename NodeCallback,
    typename... CreateTaskArgs>
Napi::Promise NodePromiseFromPythonTask(
    Napi::Env env,
    std::string&& name,
    std::tuple<std::string, std::string, CreateTaskArgs...>&& create_task,
    PythonTaskCallback&& python_task_callback,
    PythonDoneCallback&& python_done_callback,
    NodeCallback&& node_callback) {
  return NodePromiseFromPythonFuture(
      std::string(name),
      env,
      [name,
       create_task = std::move(create_task),
       python_task_callback =
           std::forward<PythonTaskCallback>(python_task_callback)]() mutable {
        py::object py_task = std::apply(
            [&name, &python_task_callback](
                const std::string& import,
                const std::string& attr,
                auto&&... args) mutable {
              return py::module::import(import.c_str())
                  .attr(attr.c_str())(
                      python_task_callback(),
                      std::forward<decltype(args)>(args)...,
                      "name"_a = name.c_str());
            },
            std::move(create_task));

        return py_task;
      },
      std::forward<PythonDoneCallback>(python_done_callback),
      std::forward<NodeCallback>(node_callback));
}


template <typename PythonTaskCallback, typename... CreateTaskArgs>
Napi::Promise NodePromiseFromPythonTask(
    Napi::Env env,
    std::string&& name,
    std::tuple<std::string, std::string, CreateTaskArgs...>&& create_task,
    PythonTaskCallback&& python_task_callback) {
  return NodePromiseFromPythonTask(
      env,
      std::move(name),
      std::move(create_task),
      std::forward<PythonTaskCallback>(python_task_callback),
      [](py::object py_result) {
        // TODO: check that `py_result` is `None`.
        return std::nullopt;
      },
      [](Napi::Env env, std::nullopt_t) { return env.Null(); });
}


template <
    typename PythonTaskCallback,
    typename PythonDoneCallback,
    typename NodeCallback>
Napi::Promise NodePromiseFromPythonTaskWithContext(
    Napi::Env env,
    std::string&& name,
    NapiSafeReference<Napi::External<py::object>>& js_context,
    PythonTaskCallback&& python_task_callback,
    PythonDoneCallback&& python_done_callback,
    NodeCallback&& node_callback) {
  py::object* py_context = js_context.Value(env).Data();
  return NodePromiseFromPythonTask(
      env,
      std::move(name),
      std::make_tuple(
          std::string("reboot.nodejs.python"),
          std::string("create_task_with_context"),
          py_context),
      [js_context,  // Ensures `py_context` remains valid.
       python_task_callback = std::forward<PythonTaskCallback>(
           python_task_callback)]() mutable { return python_task_callback(); },
      std::forward<PythonDoneCallback>(python_done_callback),
      std::forward<NodeCallback>(node_callback));
}


template <typename PythonTaskCallback>
Napi::Promise NodePromiseFromPythonTaskWithContext(
    Napi::Env env,
    std::string&& name,
    NapiSafeReference<Napi::External<py::object>>& js_context,
    PythonTaskCallback&& python_task_callback) {
  return NodePromiseFromPythonTaskWithContext(
      env,
      std::move(name),
      js_context,
      std::forward<PythonTaskCallback>(python_task_callback),
      [](py::object py_result) {
        // TODO: check that `py_result` is `None`.
        return std::nullopt;
      },
      [](Napi::Env env, std::nullopt_t) { return env.Null(); });
}


template <
    typename NodePromiseCallback,
    typename NodePromiseResolvedCallback,
    typename PythonCallback>
py::object PythonFutureFromNodePromise(
    NodePromiseCallback&& node_promise_callback,
    NodePromiseResolvedCallback&& node_promise_resolved_callback,
    PythonCallback&& python_callback) {
  py::object py_future = py::module::import("asyncio").attr("Future")();

  adaptor->ScheduleCallbackOnNodeEventLoop(
      [node_promise_callback =
           std::forward<NodePromiseCallback>(node_promise_callback),
       node_promise_resolved_callback =
           std::forward<NodePromiseResolvedCallback>(
               node_promise_resolved_callback),
       python_callback = std::forward<PythonCallback>(python_callback),
       py_future = new py::object(py_future)](Napi::Env env) mutable {
        try {
          Napi::Object js_promise = node_promise_callback(env);

          js_promise.Get("then").As<Napi::Function>().Call(
              js_promise,
              {Napi::Function::New(
                   env,
                   [node_promise_resolved_callback =
                        std::forward<NodePromiseResolvedCallback>(
                            node_promise_resolved_callback),
                    python_callback =
                        std::forward<PythonCallback>(python_callback),
                    py_future](const Napi::CallbackInfo& info) mutable {
                     // TODO: put a try/catch around
                     // `node_promise_resolved_callback` to handle
                     // any errors.

                     auto result =
                         node_promise_resolved_callback(info.Env(), info[0]);

                     adaptor->ScheduleCallbackOnPythonEventLoop(
                         [python_callback =
                              std::forward<PythonCallback>(python_callback),
                          py_future,
                          result = std::move(result)]() mutable {
                           bool cancelled =
                               py_future->attr("cancelled")().cast<bool>();
                           if (!cancelled) {
                             // TODO: put a try/catch around
                             // `python_callback` to handle any
                             // errors.
                             py_future->attr("set_result")(
                                 python_callback(std::move(result)));
                           }
                           delete py_future;
                         });
                   }),
               Napi::Function::New(
                   env,
                   [py_future](const Napi::CallbackInfo& info) {
                     std::string message =
                         message_from_js_error(info[0].As<Napi::Object>());

                     adaptor->ScheduleCallbackOnPythonEventLoop(
                         [py_future, message = std::move(message)]() {
                           bool cancelled =
                               py_future->attr("cancelled")().cast<bool>();
                           if (!cancelled) {
                             py_future->attr("set_exception")(
                                 py::module::import("builtins")
                                     .attr("Exception")(message));
                           }
                           delete py_future;
                         });
                   })});
        } catch (const std::exception& e) {
          // NOTE: we're just catching exception here vs `Napi::Error`
          // since all we care about is `what()` but we're making sue
          // that we'll get all `Napi::Error` with this
          // `static_assert`.
          static_assert(
              std::is_base_of<std::exception, Napi::Error>::value,
              "Expecting `Napi::Error` to be subclass of `std::exception`");

          std::string message = e.what();

          adaptor->ScheduleCallbackOnPythonEventLoop([py_future,
                                                      message = std::move(
                                                          message)]() {
            bool cancelled = py_future->attr("cancelled")().cast<bool>();
            if (!cancelled) {
              py_future->attr("set_exception")(
                  py::module::import("builtins").attr("Exception")(message));
            }
            delete py_future;
          });
        } catch (...) {
          // TODO: is this code unreachable because Node.js
          // will properly always only pass us a `Napi::Error`?
          adaptor->ScheduleCallbackOnPythonEventLoop([py_future]() {
            bool cancelled = py_future->attr("cancelled")().cast<bool>();
            if (!cancelled) {
              py_future->attr("set_exception")(
                  py::module::import("builtins")
                      .attr("Exception")("Unknown error"));
            }
            delete py_future;
          });
        }
      });

  return py_future;
}


template <typename NodePromiseCallback, typename NodePromiseResolvedCallback>
py::object PythonFutureFromNodePromise(
    NodePromiseCallback&& node_promise_callback,
    NodePromiseResolvedCallback&& node_promise_resolved_callback) {
  return PythonFutureFromNodePromise(
      std::forward<NodePromiseCallback>(node_promise_callback),
      std::forward<NodePromiseResolvedCallback>(node_promise_resolved_callback),
      [](auto&& result) { return std::move(result); });
}


template <typename NodePromiseCallback>
py::object PythonFutureFromNodePromise(
    NodePromiseCallback&& node_promise_callback) {
  return PythonFutureFromNodePromise(
      std::forward<NodePromiseCallback>(node_promise_callback),
      [](Napi::Env, Napi::Value) { return std::nullopt; },
      [](auto&&) { return py::none(); });
}


void Initialize(const Napi::CallbackInfo& info) {
  // Ensure we only initialize once, even if nodejs tries to load
  // the module more than once.
  static std::once_flag initialize_once;

  std::call_once(initialize_once, [&]() {
    Napi::Env env = info.Env();

    js_launchSubprocessServer->Reset(
        info[1].As<Napi::Function>(),
        /* refcount = */ 1);

    // NOTE: must initialize after storing above nodejs functions.
    adaptor->Initialize(env, info[0].As<Napi::Function>());
  });
}


void ImportPy(const Napi::CallbackInfo& info) {
  std::string module = info[0].As<Napi::String>().Utf8Value();
  std::string base64_encoded_rbt_py = info[1].As<Napi::String>().Utf8Value();

  RunCallbackOnPythonEventLoop([&module, &base64_encoded_rbt_py]() {
    py::module::import("reboot.nodejs.python")
        .attr("import_py")(module, base64_encoded_rbt_py);
  });
}


napi_type_tag MakeTypeTag(const std::string& module, const std::string& type) {
  uint64_t lower = 0;

  for (char c : module) {
    uint64_t value = static_cast<uint64_t>(static_cast<unsigned char>(c));
    // TODO: CHECK_GT(lower, std::numeric_limits<uint64_t>::max() - value);
    lower += value;
  }

  uint64_t upper = 0;

  for (char c : type) {
    uint64_t value = static_cast<uint64_t>(static_cast<unsigned char>(c));
    // TODO: CHECK_GT(upper, std::numeric_limits<uint64_t>::max() - value);
    upper += value;
  }

  return {lower, upper};
}


static const napi_type_tag reboot_aio_tests_Reboot =
    MakeTypeTag("reboot.aio.tests", "Reboot");


static const napi_type_tag reboot_aio_applications_Application =
    MakeTypeTag("reboot.aio.applications", "Application");


static const napi_type_tag reboot_aio_external_ExternalContext =
    MakeTypeTag("reboot.aio.external", "ExternalContext");


Napi::Value python3Path(const Napi::CallbackInfo& info) {
#ifdef RBT_PYTHON3_USE
  return Napi::String::New(info.Env(), RBT_PYTHON3_USE);
#else
#error "python3 not located. Please report this issue to the maintainers!"
#endif
}


Napi::Uint8Array str_to_uint8array(Napi::Env& env, const std::string& str) {
  Napi::Uint8Array array = Napi::Uint8Array::New(env, str.size());
  std::memcpy(array.Data(), str.c_str(), str.size());
  return array;
}


std::string uint8array_to_str(const Napi::Uint8Array& arr) {
  size_t length = arr.ElementLength();
  const uint8_t* data = arr.Data();
  return std::string(reinterpret_cast<const char*>(data), length);
}


Napi::Value Reboot_constructor(const Napi::CallbackInfo& info) {
  py::object* py_reboot = RunCallbackOnPythonEventLoop([]() {
    py::object tests = py::module::import("reboot.aio.tests");
    return new py::object(tests.attr("Reboot")());
  });

  Napi::External<py::object> js_external_reboot =
      make_napi_external(info.Env(), py_reboot, &reboot_aio_tests_Reboot);

  return js_external_reboot;
}


Napi::Value Reboot_createExternalContext(const Napi::CallbackInfo& info) {
  Napi::External<py::object> js_external_reboot =
      info[0].As<Napi::External<py::object>>();

  // CHECK(js_external_reboot.CheckTypeTag(&reboot_aio_tests_Reboot));

  py::object* py_reboot = js_external_reboot.Data();

  Napi::Function js_from_native_external = info[1].As<Napi::Function>();

  std::string name = info[2].As<Napi::String>().Utf8Value();

  std::optional<std::string> idempotency_seed;
  if (!info[3].IsUndefined()) {
    idempotency_seed = info[3].As<Napi::String>().Utf8Value();
  }

  std::optional<std::string> bearer_token;
  if (!info[4].IsUndefined()) {
    bearer_token = info[4].As<Napi::String>().Utf8Value();
  }

  bool app_internal = false;
  if (!info[5].IsUndefined()) {
    app_internal = info[5].As<Napi::Boolean>();
  }

  py::object* py_context = RunCallbackOnPythonEventLoop(
      [py_reboot, &name, &idempotency_seed, &bearer_token, app_internal]() {
        py::object py_idempotency_seed = py::none();
        if (idempotency_seed.has_value()) {
          py_idempotency_seed = py::module::import("uuid").attr("UUID")(
              py::str(*idempotency_seed));
        }
        py::object py_bearer_token = py::none();
        if (bearer_token.has_value()) {
          py_bearer_token = py::str(*bearer_token);
        }
        return new py::object(py_reboot->attr("create_external_context")(
            "name"_a = name,
            "idempotency_seed"_a = py_idempotency_seed,
            "bearer_token"_a = py_bearer_token,
            "app_internal"_a = app_internal));
      });

  Napi::External<py::object> js_external_context = make_napi_external(
      info.Env(),
      py_context,
      &reboot_aio_external_ExternalContext);

  return js_from_native_external.Call(
      info.Env().Global(),
      {js_external_context});
}


// NOTE: must be called within _Node_.
Napi::Promise make_js_cancelled(Napi::Env& env, py::object* py_cancelled) {
  return NodePromiseFromPythonFuture(
      "make_js_cancelled",
      env,
      [py_cancelled]() {
        // After returning we won't need `py_cancelled` anymore, so we
        // make a copy on the stack so we can delete our copy on the
        // heap.
        py::object py_cancelled_on_stack = *py_cancelled;
        delete py_cancelled;
        return py_cancelled_on_stack;
      },
      [](py::object py_result) {
        // TODO: check that `py_result` is `None`.
        return std::nullopt;
      },
      [](Napi::Env env, std::nullopt_t) {
        // NOTE: we're explicitly returning `undefined` here instead
        // of `null` which is the default if we were to not include
        // this lambda or the one above.
        return env.Undefined();
      });
}


// NOTE: must be called from within _Python_.
py::object make_py_authorizer(NapiSafeObjectReference js_authorizer) {
  // Construct a subclass of Authorizer.
  //
  // What we do below is the recommended way to do that, see:
  // https://github.com/pybind/pybind11/issues/1193

  // First create all of the attributes that we'll want this
  // subclass to have.
  py::dict attributes;

  attributes["_js_authorizer"] =
      // NOTE: we need to hold onto `authorize` as a separate member vs just
      // capturing it in the `py::cpp_function` where we need it because it
      // is only moveable not copyable.
      js_authorizer;

  // Trampolines us from Python through C++ into Node.
  attributes["_authorize"] = py::cpp_function(
      [](py::object self,
         py::object py_reader_context,
         py::object py_cancelled,
         std::string bytes_call) {
        NapiSafeObjectReference* js_authorizer_reference =
            self.attr("_js_authorizer").cast<NapiSafeObjectReference*>();

        return PythonFutureFromNodePromise(
            [js_authorizer_reference,
             py_reader_context = new py::object(py_reader_context),
             py_cancelled = new py::object(py_cancelled),
             bytes_call = std::move(bytes_call)](Napi::Env env) {
              std::vector<Napi::Value> js_args;

              Napi::External<py::object> js_external_context =
                  make_napi_external(env, py_reader_context);

              js_args.push_back(js_external_context);

              Napi::Promise js_cancelled = make_js_cancelled(env, py_cancelled);

              js_args.push_back(js_cancelled);

              js_args.push_back(str_to_uint8array(env, bytes_call));

              Napi::Object js_authorizer = js_authorizer_reference->Value(env);

              return js_authorizer.Get("_authorize")
                  .As<Napi::Function>()
                  .Call(js_authorizer, {js_args})
                  .As<Napi::Object>();
            },
            [](Napi::Env env, Napi::Value js_bytes_decision) {
              return uint8array_to_str(
                  js_bytes_decision.As<Napi::Uint8Array>());
            },
            [](std::string&& bytes_decision) {
              return py::bytes(bytes_decision);
            });
      },
      py::name("_authorize"),
      py::arg("context"),
      py::arg("cancelled"),
      py::arg("bytes_call"),
      py::is_method(py::none()));

  // Now define our subclass.
  py::object py_parent_class =
      py::module::import("reboot.nodejs.python").attr("NodeAdaptorAuthorizer");

  py::object py_parent_metaclass =
      py::reinterpret_borrow<py::object>((PyObject*) &PyType_Type);

  py::object py_class = py_parent_metaclass(
      "_NodeAdaptorAuthorizer",
      py::make_tuple(py_parent_class),
      attributes);

  return py_class();
}


struct UserServicerDetails {
  std::string name;
  std::string rbt_module;
  std::string servicer_node_adaptor;
  NapiSafeFunctionReference js_servicer_constructor;
};

struct NativeServicerDetails {
  std::string py_servicers_module;
};

using ServicerDetails =
    std::variant<UserServicerDetails, NativeServicerDetails>;


// NOTE: must be called within _Node_.
std::vector<std::shared_ptr<ServicerDetails>> make_servicer_details(
    Napi::Env env,
    const Napi::Array& js_servicers) {
  std::vector<std::shared_ptr<ServicerDetails>> servicer_details;

  for (auto&& [_, v] : js_servicers) {
    Napi::Value value = Napi::Value(v);
    if (value.IsFunction()) {
      Napi::Function js_servicer_constructor = value.As<Napi::Function>();

      std::string name =
          js_servicer_constructor.Get("name").As<Napi::String>().Utf8Value();

      std::string rbt_module = js_servicer_constructor.Get("__rbtModule__")
                                   .As<Napi::String>()
                                   .Utf8Value();

      std::string servicer_node_adaptor =
          js_servicer_constructor.Get("__servicerNodeAdaptor__")
              .As<Napi::String>()
              .Utf8Value();

      servicer_details.push_back(
          std::make_shared<ServicerDetails>(UserServicerDetails{
              name,
              rbt_module,
              servicer_node_adaptor,
              // NOTE: we create a persistent reference to the servicer
              // constructor so that we can instantiate it when requested by the
              // `{{ service.name }}ServicerNodeAdaptor` (see `reboot.py.j2`).
              NapiSafeFunctionReference(
                  Napi::Persistent(js_servicer_constructor))}));
    } else if (
        value.IsObject()
        && !value.As<Napi::Object>()
                .Get("nativeServicerModule")
                .IsUndefined()) {
      std::string module = value.As<Napi::Object>()
                               .Get("nativeServicerModule")
                               .As<Napi::String>()
                               .Utf8Value();
      servicer_details.push_back(
          std::make_shared<ServicerDetails>(NativeServicerDetails{module}));
    } else {
      Napi::Error::New(env, "Unexpected `servicer` type.")
          .ThrowAsJavaScriptException();
    }
  }

  return servicer_details;
}


// NOTE: must be called from within _Python_.
py::object make_py_user_servicer(
    py::module_ module,
    UserServicerDetails& details) {
  // For every servicer, we want to construct a _subclass_ of
  // our Python generated Node adaptor, e.g.,
  // `GreeterServicerNodeAdaptor`.
  //
  // What we do below is the recommended way to do that, see:
  // https://github.com/pybind/pybind11/issues/1193

  // First create all of the attributes that we'll want this
  // subclass to have.
  py::dict attributes;

  attributes["_js_servicer_constructor"] =
      // NOTE: we need to hold onto the servicer constructor
      // as a separate member vs just capturing it in the
      // `py::cpp_function` where we need it because it is
      // only moveable not copyable.
      details.js_servicer_constructor;

  attributes["_construct_js_servicer"] = py::cpp_function(
      [](py::object py_self) {
        NapiSafeFunctionReference* js_servicer_constructor =
            py_self.attr("_js_servicer_constructor")
                .cast<NapiSafeFunctionReference*>();

        try {
          return RunCallbackOnNodeEventLoop(
              [py_self = new py::object(py_self),
               js_servicer_constructor](Napi::Env env) {
                Napi::Object js_servicer =
                    js_servicer_constructor->Value(env).New({});

                // Also call a method to store the Python object as an
                // external so that we can call `read()` and `write()`
                // on it.
                Napi::External<py::object> js_external_self =
                    make_napi_external(env, py_self);

                js_servicer.Get("__storeExternal")
                    .As<Napi::Function>()
                    .Call(js_servicer, {js_external_self});

                return NapiSafeObjectReference(js_servicer);
              },
              /* warn = */ true);
        } catch (const std::exception& e) {
          PyErr_SetString(
              py::module::import("reboot.aio.servers")
                  .attr("InstantiateError")
                  .ptr(),
              e.what());
          throw py::error_already_set();
        }
      },
      py::is_method(py::none()));

  // Trampolines us from Python through C++ into Node for Servicer method
  // calls.
  attributes["_trampoline"] =
      py::cpp_function([](NapiSafeObjectReference& js_servicer_reference,
                          py::object py_context,
                          py::object py_cancelled,
                          std::string bytes_call) {
        return PythonFutureFromNodePromise(
            [&js_servicer_reference,
             py_context = new py::object(py_context),
             py_cancelled = new py::object(py_cancelled),
             bytes_call = std::move(bytes_call)](Napi::Env env) {
              std::vector<Napi::Value> js_args;

              Napi::External<py::object> js_external_context =
                  make_napi_external(env, py_context);

              js_args.push_back(js_external_context);

              Napi::Promise js_cancelled = make_js_cancelled(env, py_cancelled);

              js_args.push_back(js_cancelled);

              js_args.push_back(str_to_uint8array(env, bytes_call));

              Napi::Object js_servicer = js_servicer_reference.Value(env);

              return js_servicer.Get("__dispatch")
                  .As<Napi::Function>()
                  .Call(js_servicer, js_args)
                  .As<Napi::Object>();
            },
            [](Napi::Env env, Napi::Value value) {
              return uint8array_to_str(value.As<Napi::Uint8Array>());
            },
            [](std::string&& bytes_result) -> py::object {
              return py::bytes(bytes_result);
            });
      });

  // Constructs and returns an Authorizer.
  attributes["_construct_authorizer"] = py::cpp_function(
      [](NapiSafeObjectReference& js_servicer_reference) -> py::object {
        std::optional<NapiSafeObjectReference> js_authorizer;
        try {
          js_authorizer = RunCallbackOnNodeEventLoop(
              [&js_servicer_reference](
                  Napi::Env env) -> std::optional<NapiSafeObjectReference> {
                Napi::Object js_servicer = js_servicer_reference.Value(env);
                Napi::Value js_authorizer = js_servicer.Get("_authorizer")
                                                .As<Napi::Function>()
                                                .Call(js_servicer, {});
                if (!js_authorizer.IsNull()) {
                  return NapiSafeObjectReference(
                      js_authorizer.As<Napi::Object>());
                } else {
                  return std::nullopt;
                }
              });
        } catch (const std::exception& e) {
          PyErr_SetString(
              py::module::import("reboot.aio.servers")
                  .attr("InstantiateError")
                  .ptr(),
              e.what());
          throw py::error_already_set();
        }

        if (js_authorizer.has_value()) {
          return make_py_authorizer(*js_authorizer);
        } else {
          return py::none();
        }
      });

  // Now define our subclass of our Node adaptor class, e.g.,
  // `GreeterServicerNodeAdaptor`.
  py::object py_servicer_node_adaptor =
      py::module::import(details.rbt_module.c_str())
          .attr(details.servicer_node_adaptor.c_str());

  py::object py_metaclass =
      py::reinterpret_borrow<py::object>((PyObject*) &PyType_Type);

  // Our subclass will be in the `reboot_native` module with
  // the same name as what is used in JS/TS, e.g.,
  // `MyGreeterServicer`.
  py::object py_servicer = py_metaclass(
      details.name,
      py::make_tuple(py_servicer_node_adaptor),
      attributes);

  module.attr(details.name.c_str()) = py_servicer;

  return py_servicer;
}


// NOTE: must be called from within _Python_.
py::list make_py_servicers(
    const std::vector<std::shared_ptr<ServicerDetails>>& servicer_details) {
  py::module_ module = py::module::import("reboot_native");

  py::list py_servicers;

  for (const auto& details : servicer_details) {
    if (auto user_details = std::get_if<UserServicerDetails>(details.get())) {
      py_servicers.append(make_py_user_servicer(module, *user_details));
    } else if (
        auto native_details =
            std::get_if<NativeServicerDetails>(details.get())) {
      py_servicers.attr("extend")(
          py::module::import(native_details->py_servicers_module.c_str())
              .attr("servicers")());
    }
    // TODO: Can I get exhaustiveness checking for the std::variant?
  }

  // Include memoize servicers by default!
  py_servicers.attr("extend")(
      py::module::import("reboot.aio.memoize").attr("servicers")());

  return py_servicers;
}


struct TypeScriptLibraryDetails {
  std::string name;
  std::vector<std::shared_ptr<ServicerDetails>> js_servicers;
  std::vector<std::string> js_requirements;
  std::optional<NapiSafeFunctionReference> js_initialize;
};

struct PythonNativeLibraryDetails {
  std::string py_library_module;
  std::string py_library_function;
  std::optional<NapiSafeObjectReference> js_authorizer;
};

using LibraryDetails =
    std::variant<TypeScriptLibraryDetails, PythonNativeLibraryDetails>;
std::vector<std::shared_ptr<LibraryDetails>> make_library_details(
    Napi::Env env,
    const Napi::Array& js_libraries) {
  std::vector<std::shared_ptr<LibraryDetails>> library_details;

  for (auto&& [_, v] : js_libraries) {
    Napi::Object js_library = Napi::Value(v).As<Napi::Object>();

    if (!js_library.Get("nativeLibraryModule").IsUndefined()) {
      std::string module =
          js_library.Get("nativeLibraryModule").As<Napi::String>().Utf8Value();
      std::string function = js_library.Get("nativeLibraryFunction")
                                 .As<Napi::String>()
                                 .Utf8Value();

      // Get authorizer.
      std::optional<NapiSafeObjectReference> js_authorizer;
      if (!js_library.Get("authorizer").IsUndefined()) {
        js_authorizer = NapiSafeObjectReference(
            js_library.Get("authorizer").As<Napi::Object>());
      }

      library_details.push_back(
          std::make_shared<LibraryDetails>(
              PythonNativeLibraryDetails{module, function, js_authorizer}));
    } else if (
        !js_library.Get("name").IsUndefined()
        && !js_library.Get("servicers").IsUndefined()) {
      std::string name = js_library.Get("name").As<Napi::String>().Utf8Value();

      // Get servicers.
      Napi::Function js_servicers_func =
          js_library.Get("servicers").As<Napi::Function>();
      Napi::Value js_servicers_value = js_servicers_func.Call(js_library, {});
      Napi::Array js_servicers = js_servicers_value.As<Napi::Array>();
      auto servicer_details = make_servicer_details(env, js_servicers);

      // Get requirements.
      std::vector<std::string> requirements;
      if (!js_library.Get("requirements").IsUndefined()) {
        Napi::Function js_requirements_func =
            js_library.Get("requirements").As<Napi::Function>();
        Napi::Value js_requirements_value =
            js_requirements_func.Call(js_library, {});
        Napi::Array js_requirements = js_requirements_value.As<Napi::Array>();
        for (auto&& [_, requirements_v] : js_requirements) {
          std::string requirement =
              Napi::Value(requirements_v).As<Napi::String>().Utf8Value();
          requirements.push_back(requirement);
        }
      }

      std::optional<NapiSafeFunctionReference> js_initialize;
      if (!js_library.Get("initialize").IsUndefined()) {
        js_initialize = NapiSafeFunctionReference(
            js_library.Get("initialize").As<Napi::Function>());
      }

      library_details.push_back(
          std::make_shared<LibraryDetails>(TypeScriptLibraryDetails{
              name,
              servicer_details,
              requirements,
              js_initialize}));
    } else {
      Napi::Error::New(env, "Unexpected `library` type.")
          .ThrowAsJavaScriptException();
    }
  }

  return library_details;
}

py::object make_py_typescript_library(
    TypeScriptLibraryDetails& details,
    NapiSafeFunctionReference js_from_native_external) {
  // Construct a subclass of Library.
  //
  // What we do below is the recommended way to do that, see:
  // https://github.com/pybind/pybind11/issues/1193

  // First create all of the attributes that we'll want this
  // subclass to have.
  py::dict attributes;
  attributes["name"] = details.name;
  attributes["_servicers"] = make_py_servicers(details.js_servicers);
  attributes["_requirements"] = details.js_requirements;
  attributes["_initialize"] = py::none();

  if (details.js_initialize.has_value()) {
    NapiSafeFunctionReference js_initialize = details.js_initialize.value();

    attributes["_initialize"] = py::cpp_function(
        [js_initialize = std::move(js_initialize),
         js_from_native_external /* Need a copy because it is shared. ??? */](
            py::object py_context) mutable {
          return PythonFutureFromNodePromise(
              [js_initialize,
               js_from_native_external,  // NOTE: need a _copy_ of
                                         // both `js_initialize`
                                         // and
                                         // `js_from_native_external`
                                         // here since
                                         // `py_initialize` may be
                                         // called more than once!
               py_context = new py::object(py_context)](Napi::Env env) mutable {
                Napi::External<py::object> js_external_context =
                    make_napi_external(
                        env,
                        py_context,
                        &reboot_aio_external_ExternalContext);
                Napi::Object js_context =
                    js_from_native_external.Value(env)
                        .Call(
                            env.Global(),
                            {js_external_context,
                             Napi::String::New(env, "initialize")})
                        .As<Napi::Object>();

                return js_initialize.Value(env)
                    .Call(env.Global(), {js_context})
                    .As<Napi::Object>();
              });
        });
  }

  // Define the subclass.
  py::object py_parent_class =
      py::module::import("reboot.aio.applications").attr("NodeAdaptorLibrary");

  py::object py_parent_metaclass =
      py::reinterpret_borrow<py::object>((PyObject*) &PyType_Type);

  py::object py_library = py_parent_metaclass(
      "_NodeAdaptorLibrary",
      py::make_tuple(py_parent_class),
      attributes);

  return py_library();
}

// NOTE: must be called from within _Python_.
py::list make_py_libraries(
    const std::vector<std::shared_ptr<LibraryDetails>>& library_details,
    NapiSafeFunctionReference js_from_native_external) {
  py::list py_libraries;
  for (const auto& details : library_details) {
    if (auto typescript_details =
            std::get_if<TypeScriptLibraryDetails>(details.get())) {
      py_libraries.append(make_py_typescript_library(
          *typescript_details,
          js_from_native_external));
    } else if (
        auto python_details =
            std::get_if<PythonNativeLibraryDetails>(details.get())) {
      // Call the library() function with `authorizer` if one is provided.
      py::object py_library;
      if (python_details->js_authorizer.has_value()) {
        py_library =
            py::module::import(python_details->py_library_module.c_str())
                .attr(python_details->py_library_function.c_str())(
                    "authorizer"_a =
                        make_py_authorizer(*python_details->js_authorizer));
      } else {
        py_library =
            py::module::import(python_details->py_library_module.c_str())
                .attr(python_details->py_library_function.c_str())();
      }
      py_libraries.append(py_library);
    }
  }

  return py_libraries;
}


// NOTE: must be called from within _Python_.
py::object make_py_token_verifier(NapiSafeObjectReference js_token_verifier) {
  // Construct a subclass of TokenVerifier.
  //
  // What we do below is the recommended way to do that, see:
  // https://github.com/pybind/pybind11/issues/1193

  // First create all of the attributes that we'll want this
  // subclass to have.
  py::dict attributes;

  attributes["_js_token_verifier"] =
      // NOTE: we need to hold onto the `TokenVerifier`
      // as a separate member vs just capturing it in the
      // `py::cpp_function` where we need it because it is
      // only moveable not copyable.
      js_token_verifier;

  // Trampolines us from Python through C++ into Node.
  attributes["_verify_token"] = py::cpp_function(
      [](py::object self,
         py::object py_reader_context,
         py::object py_cancelled,
         std::string bytes_call) {
        NapiSafeObjectReference* js_token_verifier_reference =
            self.attr("_js_token_verifier").cast<NapiSafeObjectReference*>();

        return PythonFutureFromNodePromise(
            [js_token_verifier_reference,
             // We allocate 'py_cancelled' and 'py_reader_context' with 'new
             // py::object' on the Python thread, ensuring they remain valid
             // when passed into Node. Cleanup is handled later on the Python
             // thread, see 'make_js_context'.
             py_reader_context = new py::object(py_reader_context),
             py_cancelled = new py::object(py_cancelled),
             bytes_call = std::move(bytes_call)](Napi::Env env) {
              std::vector<Napi::Value> js_args;

              Napi::External<py::object> js_external_context =
                  make_napi_external(env, py_reader_context);

              js_args.push_back(js_external_context);

              Napi::Promise js_cancelled = make_js_cancelled(env, py_cancelled);

              js_args.push_back(js_cancelled);

              js_args.push_back(str_to_uint8array(env, bytes_call));

              Napi::Object js_token_verifier =
                  js_token_verifier_reference->Value(env);

              return js_token_verifier.Get("_verifyToken")
                  .As<Napi::Function>()
                  .Call(js_token_verifier, {js_args})
                  .As<Napi::Object>();
            },
            [](Napi::Env env, Napi::Value value) {
              std::optional<std::string> bytes_auth;
              if (!value.IsNull()) {
                bytes_auth = uint8array_to_str(value.As<Napi::Uint8Array>());
              }
              return bytes_auth;
            },
            [](std::optional<std::string>&& bytes_auth) -> py::object {
              if (bytes_auth.has_value()) {
                return py::bytes(*bytes_auth);
              } else {
                return py::none();
              }
            });
      },
      py::name("_verify_token"),
      py::arg("context"),
      py::arg("cancelled"),
      py::arg("bytes_call"),
      py::is_method(py::none()));

  py::object py_parent_class = py::module::import("reboot.nodejs.python")
                                   .attr("NodeAdaptorTokenVerifier");

  py::object py_parent_metaclass =
      py::reinterpret_borrow<py::object>((PyObject*) &PyType_Type);

  py::object py_token_verifier = py_parent_metaclass(
      "_NodeAdaptorTokenVerifier",
      py::make_tuple(py_parent_class),
      attributes);

  return py_token_verifier();
}


Napi::Value Reboot_up(const Napi::CallbackInfo& info) {
  // NOTE: we immediately get a safe reference to the `Napi::External`
  // so that Node will not garbage collect it and the `py::object*` we
  // get out of it will remain valid.
  auto js_external_reboot =
      NapiSafeReference(info[0].As<Napi::External<py::object>>());

  // CHECK(js_external_reboot.CheckTypeTag(&reboot_aio_tests_Reboot));

  py::object* py_reboot = js_external_reboot.Value(info.Env()).Data();

  auto js_external_application =
      NapiSafeReference(info[1].As<Napi::External<py::object>>());

  py::object* py_application = js_external_application.Value(info.Env()).Data();

  std::optional<bool> local_envoy;
  if (!info[2].IsUndefined()) {
    local_envoy = info[2].As<Napi::Boolean>();
  }

  int local_envoy_port = 0;
  if (!info[3].IsUndefined()) {
    local_envoy_port = info[3].As<Napi::Number>().Int32Value();
  }

  return NodePromiseFromPythonTask(
      info.Env(),
      "Reboot.up(...) in nodejs",
      {"asyncio", "create_task"},
      [js_external_reboot,  // Ensures `py_reboot` remains valid.
       py_reboot,
       js_external_application,  // Ensures `py_application` remains valid.
       py_application,
       local_envoy,
       local_envoy_port]() {
        py::object py_local_envoy = py::none();
        if (local_envoy.has_value()) {
          py_local_envoy = py::bool_(*local_envoy);
        }
        return py_reboot->attr("up")(
            py_application,
            "local_envoy"_a = py_local_envoy,
            "local_envoy_port"_a = local_envoy_port);
      },
      [](py::object py_revision) {
        py::str py_application_id =
            py_revision.attr("config").attr("application_id")();
        return std::string(py_application_id);
      },
      [](Napi::Env env, std::string&& application_id) {
        Napi::Object js_revision = Napi::Object::New(env);
        js_revision.Set("applicationId", application_id);
        return js_revision;
      });
}

Napi::Value Reboot_down(const Napi::CallbackInfo& info) {
  auto js_external_reboot =
      NapiSafeReference(info[0].As<Napi::External<py::object>>());

  // CHECK(js_external_reboot.CheckTypeTag(&reboot_aio_tests_Reboot));

  py::object* py_reboot = js_external_reboot.Value(info.Env()).Data();

  return NodePromiseFromPythonTask(
      info.Env(),
      "Reboot.down() in nodejs",
      {"asyncio", "create_task"},
      [js_external_reboot,  // Ensures `py_reboot` remains valid.
       py_reboot]() { return py_reboot->attr("down")(); });
}

Napi::Value Reboot_start(const Napi::CallbackInfo& info) {
  // NOTE: we immediately get a safe reference to the `Napi::External`
  // so that Node will not garbage collect it and the `py::object*` we
  // get out of it will remain valid.
  auto js_external_reboot =
      NapiSafeReference(info[0].As<Napi::External<py::object>>());

  // CHECK(js_external_reboot.CheckTypeTag(&reboot_aio_tests_Reboot));

  py::object* py_reboot = js_external_reboot.Value(info.Env()).Data();

  // Want to keep Node from exiting until we've called
  // `Reboot.stop()`.
  adaptor->KeepNodeFromExiting(info.Env());

  return NodePromiseFromPythonTask(
      info.Env(),
      "Reboot.start() in nodejs",
      {"asyncio", "create_task"},
      [js_external_reboot,  // Ensures `py_reboot` remains valid.
       py_reboot]() { return py_reboot->attr("start")(); });
}

Napi::Value Reboot_stop(const Napi::CallbackInfo& info) {
  // NOTE: we immediately get a safe reference to the `Napi::External`
  // so that Node will not garbage collect it and the `py::object*` we
  // get out of it will remain valid.
  auto js_external_reboot =
      NapiSafeReference(info[0].As<Napi::External<py::object>>());

  // CHECK(js_external_reboot.CheckTypeTag(&reboot_aio_tests_Reboot));

  py::object* py_reboot = js_external_reboot.Value(info.Env()).Data();

  Napi::Promise js_promise = NodePromiseFromPythonTask(
      info.Env(),
      "Reboot.stop() in nodejs",
      {"asyncio", "create_task"},
      [js_external_reboot,  // Ensures `py_reboot` remains valid.
       py_reboot]() { return py_reboot->attr("stop")(); });

  // Allow Node to exit after we've resolved or rejected the promise.
  auto js_resolve_reject =
      Napi::Function::New(info.Env(), [](const Napi::CallbackInfo& info) {
        adaptor->AllowNodeToExit(info.Env());
      });

  js_promise.Get("then").As<Napi::Function>().Call(
      js_promise,
      {js_resolve_reject, js_resolve_reject});

  return js_promise;
}

// NOTE: We block on a promise here, so this method should not be called
// outside of tests.
Napi::Value Reboot_url(const Napi::CallbackInfo& info) {
  // NOTE: we immediately get a safe reference to the `Napi::External`
  // so that Node will not garbage collect it and the `py::object*` we
  // get out of it will remain valid.
  auto js_external_reboot =
      NapiSafeReference(info[0].As<Napi::External<py::object>>());

  // CHECK(...CheckTypeTag(...));

  py::object* py_reboot = js_external_reboot.Value(info.Env()).Data();

  std::string url = RunCallbackOnPythonEventLoop([py_reboot]() {
    py::str url = py_reboot->attr("url")();
    return std::string(url);
  });

  return Napi::String::New(info.Env(), url);
}

Napi::Value Service_constructor(const Napi::CallbackInfo& info) {
  Napi::Object js_args = info[0].As<Napi::Object>();

  std::string rbt_module =
      js_args.Get("rbtModule").As<Napi::String>().Utf8Value();

  std::string node_adaptor =
      js_args.Get("nodeAdaptor").As<Napi::String>().Utf8Value();

  std::string id = js_args.Get("id").As<Napi::String>().Utf8Value();

  py::object* py_service =
      RunCallbackOnPythonEventLoop([&rbt_module, &node_adaptor, &id]() {
        py::object py_module = py::module::import(rbt_module.c_str());
        py::object py_schedule_type =
            py_module.attr(node_adaptor.c_str()).attr("_Schedule");
        return new py::object(py_module.attr(node_adaptor.c_str())(
            // The call will stay within the same application.
            "application_id"_a = py::none(),
            "state_id"_a = id,
            "schedule_type"_a = py_schedule_type));
      });

  Napi::External<py::object> js_external_service =
      make_napi_external(info.Env(), py_service);

  // auto type_tag = MakeTypeTag(module, type);
  // js_external_service.TypeTag(&type_tag);

  return js_external_service;
}


Napi::Value Service_call(const Napi::CallbackInfo& info) {
  Napi::Object js_args = info[0].As<Napi::Object>();

  // NOTE: we immediately get a safe reference to the `Napi::External`
  // so that Node will not garbage collect it and the `py::object*` we
  // get out of it will remain valid.
  auto js_external_service = NapiSafeReference(
      js_args.Get("external").As<Napi::External<py::object>>());

  // CHECK(js_external_service.CheckTypeTag(...));

  py::object* py_service = js_external_service.Value(info.Env()).Data();

  std::string kind = js_args.Get("kind").As<Napi::String>();
  std::string method = js_args.Get("method").As<Napi::String>();
  std::string request_module = js_args.Get("requestModule").As<Napi::String>();
  std::string request_type = js_args.Get("requestType").As<Napi::String>();

  // NOTE: we immediately get a safe reference to the `Napi::External`
  // so that Node will not garbage collect it and the `py::object*` we
  // get out of it will remain valid.
  auto js_external_context = NapiSafeReference(
      js_args.Get("context").As<Napi::External<py::object>>());

  // CHECK(...CheckTypeTag(...));

  py::object* py_context = js_external_context.Value(info.Env()).Data();

  std::string json_request = js_args.Get("jsonRequest").As<Napi::String>();

  std::string json_options = js_args.Get("jsonOptions").As<Napi::String>();

  return NodePromiseFromPythonTaskWithContext(
      info.Env(),
      "servicer._" + kind + "(\"" + method + "\", ...) in nodejs",
      js_external_context,
      [js_external_service,  // Ensures `py_service` remains valid.
       py_service,
       kind,
       method,
       request_module,
       request_type,
       js_external_context,  // Ensures `py_context` remains valid.
       py_context,
       json_request,
       json_options]() {
        // If a type is a nested message type, we can't import it directly
        // as 'from module import Foo.Bar.Baz', instead we need to import the
        // top level 'Foo' and call 'Foo.Bar.Baz' on it.
        std::vector<std::string> request_type_parts;
        std::stringstream ss(request_type);
        std::string token;
        while (std::getline(ss, token, '.')) {
          request_type_parts.push_back(token);
        }

        py::object py_request_type = py::module::import(request_module.c_str());

        for (const auto& part : request_type_parts) {
          py_request_type = py_request_type.attr(part.c_str());
        }

        return py_service->attr(("_" + kind).c_str())(
            method,
            py_context,
            py_request_type,
            json_request,
            json_options);
      },
      [](py::object py_json) { return py_json.cast<std::string>(); },
      [](Napi::Env env, std::string&& json) {
        return Napi::String::New(env, json);
      });
}


Napi::Value Task_await(const Napi::CallbackInfo& info) {
  Napi::Object js_args = info[0].As<Napi::Object>();

  // NOTE: we immediately get a safe reference to the `Napi::External`
  // so that Node will not garbage collect it and the `py::object*` we
  // get out of it will remain valid.
  auto js_external_context = NapiSafeReference(
      js_args.Get("context").As<Napi::External<py::object>>());

  // CHECK(...CheckTypeTag(...));

  py::object* py_context = js_external_context.Value(info.Env()).Data();

  std::string rbt_module = js_args.Get("rbtModule").As<Napi::String>();

  std::string state_name = js_args.Get("stateName").As<Napi::String>();

  std::string method = js_args.Get("method").As<Napi::String>();

  std::string json_task_id = js_args.Get("jsonTaskId").As<Napi::String>();

  return NodePromiseFromPythonTaskWithContext(
      info.Env(),
      "reboot.nodejs.python.task_await(\"" + state_name + "\", \"" + method
          + "\", ...) in nodejs",
      js_external_context,
      [rbt_module = std::move(rbt_module),
       state_name = std::move(state_name),
       method = std::move(method),
       js_external_context,  // Ensures `py_context` remains valid.
       py_context,
       json_task_id]() {
        return py::module::import("reboot.nodejs.python")
            .attr("task_await")(
                py_context,
                py::module::import(rbt_module.c_str()).attr(state_name.c_str()),
                method,
                json_task_id);
      },
      [](py::object py_json) { return py_json.cast<std::string>(); },
      [](Napi::Env env, std::string&& json) {
        return Napi::String::New(env, json);
      });
}

Napi::Value ExternalContext_constructor(const Napi::CallbackInfo& info) {
  std::string name = info[0].As<Napi::String>().Utf8Value();

  std::optional<std::string> url;
  if (!info[1].IsUndefined()) {
    url = info[1].As<Napi::String>().Utf8Value();
  }

  std::optional<std::string> bearer_token;
  if (!info[3].IsUndefined()) {
    bearer_token = info[3].As<Napi::String>().Utf8Value();
  }

  std::optional<std::string> idempotency_seed;
  if (!info[4].IsUndefined()) {
    idempotency_seed = info[4].As<Napi::String>().Utf8Value();
  }

  bool idempotency_required = false;
  if (!info[5].IsUndefined()) {
    idempotency_required = info[5].As<Napi::Boolean>();
  }

  std::optional<std::string> idempotency_required_reason;
  if (!info[6].IsUndefined()) {
    idempotency_required_reason = info[6].As<Napi::String>().Utf8Value();
  }

  py::object* py_external_context =
      RunCallbackOnPythonEventLoop([&name,
                                    &url,
                                    &bearer_token,
                                    &idempotency_seed,
                                    &idempotency_required,
                                    &idempotency_required_reason]() {
        py::object py_external = py::module::import("reboot.aio.external");

        auto convert_str =
            [](const std::optional<std::string>& optional) -> py::object {
          if (optional.has_value()) {
            return py::str(*optional);
          } else {
            return py::none();
          }
        };

        return new py::object(py_external.attr("ExternalContext")(
            "name"_a = py::str(name),
            "url"_a = convert_str(url),
            "bearer_token"_a = convert_str(bearer_token),
            "idempotency_seed"_a = convert_str(idempotency_seed),
            "idempotency_required"_a = py::bool_(idempotency_required),
            "idempotency_required_reason"_a =
                convert_str(idempotency_required_reason)));
      });

  Napi::External<py::object> js_external_context = make_napi_external(
      info.Env(),
      py_external_context,
      &reboot_aio_external_ExternalContext);

  return js_external_context;
}

Napi::Value Application_constructor(const Napi::CallbackInfo& info) {
  auto js_from_native_external =
      NapiSafeFunctionReference(info[0].As<Napi::Function>());

  Napi::Array js_servicers = info[1].As<Napi::Array>();
  auto servicer_details = make_servicer_details(info.Env(), js_servicers);

  Napi::Object js_web_framework = info[2].As<Napi::Object>();

  auto js_web_framework_start = NapiSafeFunctionReference(
      js_web_framework.Get("start").As<Napi::Function>());

  auto js_web_framework_stop = NapiSafeFunctionReference(
      js_web_framework.Get("stop").As<Napi::Function>());

  auto js_initialize = NapiSafeFunctionReference(info[3].As<Napi::Function>());

  std::optional<std::string> initialize_bearer_token;
  if (!info[4].IsUndefined()) {
    initialize_bearer_token = info[4].As<Napi::String>().Utf8Value();
  }

  std::optional<NapiSafeObjectReference> js_token_verifier;
  if (!info[5].IsUndefined()) {
    js_token_verifier = NapiSafeReference(info[5].As<Napi::Object>());
  }

  Napi::Array js_libraries = info[6].As<Napi::Array>();
  auto library_details = make_library_details(info.Env(), js_libraries);

  py::object* py_application = RunCallbackOnPythonEventLoop(
      [servicer_details = std::move(servicer_details),
       js_web_framework_start = std::move(js_web_framework_start),
       js_web_framework_stop = std::move(js_web_framework_stop),
       initialize_bearer_token = std::move(initialize_bearer_token),
       js_initialize = std::move(js_initialize),
       js_token_verifier,
       js_from_native_external = std::move(js_from_native_external),
       library_details = std::move(library_details)]() {
        py::list py_servicers = make_py_servicers(servicer_details);
        py::list py_libraries =
            make_py_libraries(library_details, js_from_native_external);

        py::object py_web_framework_start = py::cpp_function(
            [js_web_framework_start = std::move(js_web_framework_start),
             js_from_native_external /* Need a copy because it is shared. */](
                std::string server_id,
                py::object py_port,
                py::object py_channel_manager) {
              std::optional<int> port;
              if (!py_port.is_none()) {
                port = py_port.cast<int>();
              }

              return PythonFutureFromNodePromise(
                  [js_web_framework_start = std::move(js_web_framework_start),
                   js_from_native_external = std::move(js_from_native_external),
                   server_id = std::move(server_id),
                   port,
                   py_channel_manager = new py::object(py_channel_manager)](
                      Napi::Env env) mutable {
                    Napi::External<py::object> js_external_channel_manager =
                        make_napi_external(env, py_channel_manager);

                    Napi::Function js_create_external_context =
                        Napi::Function::New(
                            env,
                            [js_from_native_external =
                                 std::move(js_from_native_external),
                             // Ensures `py_channel_manager` remains valid.
                             js_external_channel_manager = NapiSafeReference(
                                 js_external_channel_manager)](
                                const Napi::CallbackInfo& info) mutable {
                              Napi::Object js_args = info[0].As<Napi::Object>();

                              std::string name = js_args.Get("name")
                                                     .As<Napi::String>()
                                                     .Utf8Value();

                              std::optional<std::string> bearer_token;
                              if (!js_args.Get("bearerToken").IsUndefined()) {
                                bearer_token = js_args.Get("bearerToken")
                                                   .As<Napi::String>()
                                                   .Utf8Value();
                              }

                              py::object* py_channel_manager =
                                  js_external_channel_manager.Value(info.Env())
                                      .Data();

                              return NodePromiseFromPythonCallback(
                                  info.Env(),
                                  [name = std::move(name),
                                   bearer_token = std::move(bearer_token),
                                   // Ensures `py_channel_manager`
                                   // remains valid. Need a copy
                                   // because
                                   // `js_create_external_context` may
                                   // get called more than once.
                                   js_external_channel_manager,
                                   py_channel_manager]() mutable {
                                    py::object py_bearer_token = py::none();
                                    if (bearer_token.has_value()) {
                                      py_bearer_token = py::str(*bearer_token);
                                    }

                                    return new py::object(
                                        py::module::import(
                                            "reboot.aio.external")
                                            .attr("ExternalContext")(
                                                "name"_a = py::str(name),
                                                "channel_manager"_a =
                                                    py_channel_manager,
                                                "bearer_token"_a =
                                                    py_bearer_token));
                                  },
                                  [
                                      // Need a copy, because we will
                                      // create the 'ExternalContext' more
                                      // than once, which means we will
                                      // call this function more than once
                                      // as well.
                                      js_from_native_external](
                                      Napi::Env env,
                                      py::object* py_context) {
                                    Napi::External<py::object>
                                        // (check_line_length skip)
                                        js_external_context = make_napi_external(
                                            env,
                                            py_context,
                                            // (check_line_length skip)
                                            &reboot_aio_external_ExternalContext);

                                    return js_from_native_external.Value(env)
                                        .Call(
                                            env.Global(),
                                            {js_external_context,
                                             Napi::String::New(
                                                 env,
                                                 "external")});
                                  });
                            });

                    return js_web_framework_start.Value(env)
                        .Call(
                            env.Global(),
                            {Napi::String::New(env, server_id),
                             port.has_value() ? Napi::Number::New(env, *port)
                                              : env.Null(),
                             js_create_external_context})
                        .As<Napi::Object>();
                  },
                  [](Napi::Env env, Napi::Value value) {
                    Napi::Number js_port = value.As<Napi::Number>();
                    return js_port.Int32Value();
                  });
            });

        py::object py_web_framework_stop = py::cpp_function(
            [js_web_framework_stop =
                 std::move(js_web_framework_stop)](std::string server_id) {
              return PythonFutureFromNodePromise(
                  [js_web_framework_stop = std::move(js_web_framework_stop),
                   server_id = std::move(server_id)](Napi::Env env) mutable {
                    return js_web_framework_stop.Value(env)
                        .Call(env.Global(), {Napi::String::New(env, server_id)})
                        .As<Napi::Object>();
                  });
            });

        py::object py_initialize = py::cpp_function(
            [js_initialize = std::move(js_initialize),
             js_from_native_external /* Need a copy because it is shared. */](
                py::object py_context) mutable {
              return PythonFutureFromNodePromise(
                  [js_initialize,
                   js_from_native_external,  // NOTE: need a _copy_ of
                                             // both `js_initialize`
                                             // and
                                             // `js_from_native_external`
                                             // here since
                                             // `py_initialize` may be
                                             // called more than once!
                   py_context =
                       new py::object(py_context)](Napi::Env env) mutable {
                    Napi::External<py::object> js_external_context =
                        make_napi_external(
                            env,
                            py_context,
                            &reboot_aio_external_ExternalContext);

                    Napi::Object js_context =
                        js_from_native_external.Value(env)
                            .Call(
                                env.Global(),
                                {js_external_context,
                                 Napi::String::New(env, "initialize")})
                            .As<Napi::Object>();

                    return js_initialize.Value(env)
                        .Call(env.Global(), {js_context})
                        .As<Napi::Object>();
                  });
            });

        py::object py_initialize_bearer_token = py::none();
        if (initialize_bearer_token.has_value()) {
          py_initialize_bearer_token = py::str(*initialize_bearer_token);
        }

        py::object py_token_verifier = py::none();
        if (js_token_verifier.has_value()) {
          py_token_verifier = make_py_token_verifier(*js_token_verifier);
        }

        return new py::object(
            py::module::import("reboot.aio.applications")
                .attr("NodeApplication")(
                    "servicers"_a = py_servicers,
                    "libraries"_a = py_libraries,
                    "web_framework_start"_a = py_web_framework_start,
                    "web_framework_stop"_a = py_web_framework_stop,
                    "initialize"_a = py_initialize,
                    "initialize_bearer_token"_a = py_initialize_bearer_token,
                    "token_verifier"_a = py_token_verifier));
      });

  Napi::External<py::object> js_external_application = make_napi_external(
      info.Env(),
      py_application,
      &reboot_aio_applications_Application);

  return js_external_application;
}


Napi::Value Application_run(const Napi::CallbackInfo& info) {
  // Keep Node from exiting while we're running `Application.run` so
  // that we can get calls from Python.
  adaptor->KeepNodeFromExiting(info.Env());

  auto js_external_application =
      NapiSafeReference(info[0].As<Napi::External<py::object>>());

  py::object* py_application = js_external_application.Value(info.Env()).Data();

  Napi::Promise js_promise = NodePromiseFromPythonTask(
      info.Env(),
      "Application.run() in nodejs",
      {"reboot.nodejs.python", "create_task"},
      [js_external_application,  // Ensures `py_application` remains valid.
       py_application]() { return py_application->attr("run")(); });

  // More to do if `Application.run` returns ...
  js_promise.Get("then").As<Napi::Function>().Call(
      js_promise,
      {Napi::Function::New(
           info.Env(),
           [](const Napi::CallbackInfo& info) {
             // Allow Node to exit after `Application.run` returns.
             adaptor->AllowNodeToExit(info.Env());
           }),
       Napi::Function::New(info.Env(), [](const Napi::CallbackInfo& info) {
         // There was an error, let's also set the
         // `process.exitCode` to reflect this.
         info.Env().Global().Get("process").As<Napi::Object>().Set(
             "exitCode",
             1);

         // Allow Node to exit after `Application.run` returns.
         adaptor->AllowNodeToExit(info.Env());
       })});

  return js_promise;
}


Napi::Value Context_generateIdempotentStateId(const Napi::CallbackInfo& info) {
  // NOTE: we immediately get a safe reference to the `Napi::External`
  // so that Node will not garbage collect it and the `py::object*` we
  // get out of it will remain valid.
  auto js_external_context =
      NapiSafeReference(info[0].As<Napi::External<py::object>>());

  py::object* py_context = js_external_context.Value(info.Env()).Data();

  std::string state_type = info[1].As<Napi::String>().Utf8Value();

  std::string service_name = info[2].As<Napi::String>().Utf8Value();

  std::string method = info[3].As<Napi::String>().Utf8Value();

  Napi::Object idempotency_options = info[4].As<Napi::Object>();
  auto js_key = idempotency_options.Get("key");
  std::optional<std::string> key;
  if (js_key.IsString()) {
    key = js_key.As<Napi::String>().Utf8Value();
  }
  auto js_alias = idempotency_options.Get("alias");
  std::optional<std::string> alias;
  if (js_alias.IsString()) {
    alias = js_alias.As<Napi::String>().Utf8Value();
  }
  auto js_per_iteration = idempotency_options.Get("perIteration");
  std::optional<bool> per_iteration;
  if (js_per_iteration.IsBoolean()) {
    per_iteration = js_per_iteration.As<Napi::Boolean>();
  }

  return NodePromiseFromPythonCallback(
      info.Env(),
      [js_external_context,  // Ensures `py_context` remains valid.
       py_context,
       state_type = std::move(state_type),
       service_name = std::move(service_name),
       method = std::move(method),
       key = std::move(key),
       alias = std::move(alias),
       per_iteration = std::move(per_iteration)]() {
        // Need to use `call_with_context` to ensure that we have
        // `py_context` as a valid asyncio context variable.
        py::object py_idempotency =
            py::module::import("reboot.nodejs.python")
                .attr("call_with_context")(
                    py::cpp_function([&]() {
                      py::object py_key = py::none();
                      if (key.has_value()) {
                        py_key = py::cast(*key);
                      }
                      py::object py_alias = py::none();
                      if (alias.has_value()) {
                        py_alias = py::cast(*alias);
                      }
                      py::object py_how = py::none();
                      if (per_iteration.has_value() && *per_iteration) {
                        py_how = py::module::import("reboot.aio.idempotency")
                                     .attr("PER_ITERATION");
                      }
                      return py::module::import("reboot.aio.contexts")
                          .attr("Context")
                          .attr("idempotency")(
                              "key"_a = py_key,
                              "alias"_a = py_alias,
                              "how"_a = py_how);
                    }),
                    py_context);

        py::object py_generate_idempotent_state_id =
            py_context->attr("generate_idempotent_state_id");

        py::object py_state_id = py_generate_idempotent_state_id(
            state_type,
            service_name,
            method,
            py_idempotency);

        return py_state_id.cast<std::string>();
      },
      [](Napi::Env env, std::string&& state_id) {
        return Napi::String::New(env, state_id);
      });
}


Napi::Value WriterContext_set_sync(const Napi::CallbackInfo& info) {
  // NOTE: we immediately get a safe reference to the `Napi::External`
  // so that Node will not garbage collect it and the `py::object*` we
  // get out of it will remain valid.
  auto js_external_context =
      NapiSafeReference(info[0].As<Napi::External<py::object>>());

  py::object* py_context = js_external_context.Value(info.Env()).Data();

  bool sync = info[1].As<Napi::Boolean>();

  RunCallbackOnPythonEventLoop(
      [&py_context, sync]() { py_context->attr("sync") = sync; });

  return info.Env().Undefined();
}


Napi::Value WorkflowContext_loop(const Napi::CallbackInfo& info) {
  auto js_external_context =
      NapiSafeReference(info[0].As<Napi::External<py::object>>());

  // CHECK(...CheckTypeTag(...));

  py::object* py_context = js_external_context.Value(info.Env()).Data();

  std::string alias = info[1].As<Napi::String>().Utf8Value();

  return NodePromiseFromPythonTaskWithContext(
      info.Env(),
      "context.loop(...) in nodejs",
      js_external_context,
      [js_external_context,  // Ensures `py_context` remains valid.
       py_context,
       alias = std::move(alias)]() {
        return py::module::import("reboot.nodejs.python")
            .attr("loop")(py_context, alias);
      },
      [](py::object py_iterate) { return new py::object(py_iterate); },
      [js_external_context](Napi::Env env, py::object* py_iterate) mutable {
        Napi::External<py::object> js_iterate_external =
            make_napi_external(env, py_iterate);

        Napi::Function js_iterate = Napi::Function::New(
            env,
            [js_external_context,
             js_iterate_external =  // Ensures `py_iterate` remains valid.
             NapiSafeReference(js_iterate_external),
             py_iterate](const Napi::CallbackInfo& info) mutable {
              bool more = info[0].As<Napi::Boolean>();
              return NodePromiseFromPythonTaskWithContext(
                  info.Env(),
                  "iterate(...) in nodejs",
                  js_external_context,
                  [js_iterate_external, py_iterate, more]() {
                    return (*py_iterate)(more);
                  },
                  [](py::object py_iteration) -> std::optional<int> {
                    if (!py_iteration.is_none()) {
                      return py_iteration.cast<int>();
                    } else {
                      return std::nullopt;
                    }
                  },
                  [](Napi::Env env,
                     std::optional<int>&& iteration) -> Napi::Value {
                    if (iteration.has_value()) {
                      return Napi::Number::New(env, *iteration);
                    } else {
                      return env.Null();
                    }
                  });
            });

        return js_iterate;
      });
}


Napi::Value retry_reactively_until(const Napi::CallbackInfo& info) {
  auto js_external_context =
      NapiSafeReference(info[0].As<Napi::External<py::object>>());

  // CHECK(...CheckTypeTag(...));

  py::object* py_context = js_external_context.Value(info.Env()).Data();

  auto js_condition = NapiSafeFunctionReference(info[1].As<Napi::Function>());

  return NodePromiseFromPythonTaskWithContext(
      info.Env(),
      "retry_reactively_until(...) in nodejs",
      js_external_context,
      [js_external_context,  // Ensures `py_context` remains valid.
       py_context,
       js_condition = std::move(js_condition)]() {
        py::object py_condition = py::cpp_function(
            [js_condition = std::move(js_condition)]() mutable {
              return PythonFutureFromNodePromise(
                  // NOTE: need a _copy_ of
                  // `js_condition` here since
                  // `py_condition` may be called more
                  // than once!
                  [js_condition](Napi::Env env) mutable {
                    return js_condition.Value(env)
                        .Call(env.Global(), {})
                        .As<Napi::Object>();
                  },
                  [](Napi::Env, Napi::Value value) {
                    return value.As<Napi::Boolean>().Value();
                  });
            });

        return py::module::import("reboot.aio.contexts")
            .attr("retry_reactively_until")(py_context, py_condition);
      });
}


Napi::Value memoize(const Napi::CallbackInfo& info) {
  auto js_external_context =
      NapiSafeReference(info[0].As<Napi::External<py::object>>());

  // CHECK(...CheckTypeTag(...));

  py::object* py_context = js_external_context.Value(info.Env()).Data();

  Napi::Object idempotency_tuple = info[1].As<Napi::Array>();
  auto js_alias = idempotency_tuple.Get((uint32_t) 0);
  std::string alias = js_alias.As<Napi::String>().Utf8Value();
  auto js_how = idempotency_tuple.Get((uint32_t) 1);
  std::string how = js_how.As<Napi::String>().Utf8Value();

  auto js_callable = NapiSafeFunctionReference(info[2].As<Napi::Function>());

  bool at_most_once = info[3].As<Napi::Boolean>();

  bool until = info[4].As<Napi::Boolean>();

  return NodePromiseFromPythonTaskWithContext(
      info.Env(),
      "memoize(...) in nodejs",
      js_external_context,
      [js_external_context,  // Ensures `py_context` remains valid.
       py_context,
       alias = std::move(alias),
       how = std::move(how),
       js_callable = std::move(js_callable),
       at_most_once,
       until]() {
        py::object py_callable =
            py::cpp_function([js_callable = std::move(js_callable)]() mutable {
              return PythonFutureFromNodePromise(
                  // NOTE: need a _copy_ of `js_callable` here since
                  // `py_callable` may be called more than once!
                  [js_callable](Napi::Env env) mutable {
                    return js_callable.Value(env)
                        .Call(env.Global(), {})
                        .As<Napi::Object>();
                  },
                  [](Napi::Env, Napi::Value value) {
                    return std::string(value.As<Napi::String>().Utf8Value());
                  });
            });

        return py::module::import("reboot.aio.memoize")
            .attr("memoize")(
                py::make_tuple(alias, how),
                py_context,
                py_callable,
                "type_t"_a = py::eval("str"),
                "at_most_once"_a = at_most_once,
                "until"_a = until);
      },
      [](py::object py_json) { return py_json.cast<std::string>(); },
      [](Napi::Env env, std::string&& json) {
        return Napi::String::New(env, json);
      });
}


Napi::Value Servicer_read(const Napi::CallbackInfo& info) {
  auto js_external_servicer =
      NapiSafeReference(info[0].As<Napi::External<py::object>>());

  // CHECK(...CheckTypeTag(...));

  py::object* py_servicer = js_external_servicer.Value(info.Env()).Data();

  auto js_external_context =
      NapiSafeReference(info[1].As<Napi::External<py::object>>());

  // CHECK(...CheckTypeTag(...));

  std::string json_options = info[2].As<Napi::String>().Utf8Value();

  py::object* py_context = js_external_context.Value(info.Env()).Data();

  return NodePromiseFromPythonTaskWithContext(
      info.Env(),
      "servicer._read(...) in nodejs",
      js_external_context,
      [js_external_servicer,  // Ensures `py_servicer` remains valid.
       py_servicer,
       js_external_context,  // Ensures `py_context` remains valid.
       py_context,
       json_options = std::move(json_options)]() {
        return py_servicer->attr("_read")(py_context, json_options);
      },
      [](py::object py_json) { return py_json.cast<std::string>(); },
      [](Napi::Env env, std::string&& json) {
        return Napi::String::New(env, json);
      });
}


Napi::Value Servicer_write(const Napi::CallbackInfo& info) {
  auto js_external_servicer =
      NapiSafeReference(info[0].As<Napi::External<py::object>>());

  // CHECK(...CheckTypeTag(...));

  py::object* py_servicer = js_external_servicer.Value(info.Env()).Data();

  auto js_external_context =
      NapiSafeReference(info[1].As<Napi::External<py::object>>());

  // CHECK(...CheckTypeTag(...));

  py::object* py_context = js_external_context.Value(info.Env()).Data();

  auto js_writer = NapiSafeFunctionReference(info[2].As<Napi::Function>());

  std::string json_options = info[3].As<Napi::String>().Utf8Value();

  return NodePromiseFromPythonTaskWithContext(
      info.Env(),
      "servicer._write(...) in nodejs",
      js_external_context,
      [js_external_servicer,  // Ensures `py_servicer` remains valid.
       py_servicer,
       js_external_context,  // Ensures `py_context` remains valid.
       py_context,
       js_writer = std::move(js_writer),
       json_options = std::move(json_options)]() {
        py::object py_writer = py::cpp_function(
            [js_writer = std::move(js_writer)](std::string state_json) mutable {
              return PythonFutureFromNodePromise(
                  [js_writer,  // NOTE: need a _copy_ of
                               // `js_writer` here since
                               // `py_writer` may be called more
                               // than once!
                   state_json](Napi::Env env) mutable {
                    return js_writer.Value(env)
                        .Call(
                            env.Global(),
                            {Napi::String::New(env, state_json)})
                        .As<Napi::Object>();
                  },
                  [](Napi::Env env, Napi::Value value) {
                    return std::string(value.As<Napi::String>().Utf8Value());
                  });
            });

        return py_servicer->attr("_write")(py_context, py_writer, json_options);
      },
      [](py::object py_result) { return py_result.cast<std::string>(); },
      [](Napi::Env env, std::string&& result) {
        return Napi::String::New(env, result);
      });
}


Napi::Object Init(Napi::Env env, Napi::Object exports) {
  // Return our exports.
  exports.Set(
      Napi::String::New(env, "initialize"),
      Napi::Function::New(env, Initialize));

  exports.Set(
      Napi::String::New(env, "importPy"),
      Napi::Function::New(env, ImportPy));

  exports.Set(
      Napi::String::New(env, "python3Path"),
      Napi::Function::New<python3Path>(env));

  exports.Set(
      Napi::String::New(env, "Reboot_constructor"),
      Napi::Function::New<Reboot_constructor>(env));

  exports.Set(
      Napi::String::New(env, "Reboot_createExternalContext"),
      Napi::Function::New<Reboot_createExternalContext>(env));

  exports.Set(
      Napi::String::New(env, "Reboot_start"),
      Napi::Function::New<Reboot_start>(env));

  exports.Set(
      Napi::String::New(env, "Reboot_stop"),
      Napi::Function::New<Reboot_stop>(env));

  exports.Set(
      Napi::String::New(env, "Reboot_up"),
      Napi::Function::New<Reboot_up>(env));

  exports.Set(
      Napi::String::New(env, "Reboot_down"),
      Napi::Function::New<Reboot_down>(env));

  exports.Set(
      Napi::String::New(env, "Reboot_url"),
      Napi::Function::New<Reboot_url>(env));

  exports.Set(
      Napi::String::New(env, "Service_constructor"),
      Napi::Function::New<Service_constructor>(env));

  exports.Set(
      Napi::String::New(env, "Service_call"),
      Napi::Function::New<Service_call>(env));

  exports.Set(
      Napi::String::New(env, "Context_generateIdempotentStateId"),
      Napi::Function::New<Context_generateIdempotentStateId>(env));

  exports.Set(
      Napi::String::New(env, "WriterContext_set_sync"),
      Napi::Function::New<WriterContext_set_sync>(env));

  exports.Set(
      Napi::String::New(env, "WorkflowContext_loop"),
      Napi::Function::New<WorkflowContext_loop>(env));

  exports.Set(
      Napi::String::New(env, "retry_reactively_until"),
      Napi::Function::New<retry_reactively_until>(env));

  exports.Set(
      Napi::String::New(env, "memoize"),
      Napi::Function::New<memoize>(env));

  exports.Set(
      Napi::String::New(env, "Task_await"),
      Napi::Function::New<Task_await>(env));

  exports.Set(
      Napi::String::New(env, "ExternalContext_constructor"),
      Napi::Function::New<ExternalContext_constructor>(env));

  exports.Set(
      Napi::String::New(env, "Application_constructor"),
      Napi::Function::New<Application_constructor>(env));

  exports.Set(
      Napi::String::New(env, "Application_run"),
      Napi::Function::New<Application_run>(env));

  exports.Set(
      Napi::String::New(env, "Servicer_read"),
      Napi::Function::New<Servicer_read>(env));

  exports.Set(
      Napi::String::New(env, "Servicer_write"),
      Napi::Function::New<Servicer_write>(env));

  return exports;
}


NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
