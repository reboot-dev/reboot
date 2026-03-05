#include <iostream>

#include "tests/cpp/another_service.pb.h"
#include "tests/cpp/another_service_generated/another_service_generated.h"
#include "tests/cpp/sample_service.pb.h"
#include "tests/cpp/sample_service_generated/sample_service_generated.h"

int main() {
  auto response = CallSampleService(Request{});
  assert(response.data() == "hello");
  auto output = CallAnotherService(Input{});
  assert(output.value() == 100);

  std::cout << "All checks passed!\n";
}
