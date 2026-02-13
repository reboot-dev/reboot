#include <arpa/inet.h>
#include <netdb.h>
#include <netinet/in.h>
#include <signal.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cstring>
#include <iostream>

// Helper "local envoy nanny". Runs _within_ the container running
// Envoy. We statically compile this so that we can inject it into the
// container without needing to inject any other dependencies.
//
// The nanny connects to the 'LocalEnvoy' "server" at the 'address'
// and 'port' passed in on the command line. It waits for EOF (or an
// error) to indicate that the 'LocalEnvoy' has terminated. If the
// 'LocalEnvoy' was killed then it might not have been able to
// properly stop the Envoy container which is now an orphan (this is
// the nanny for the orphan). Once the nanny gets EOF (or an error) it
// sends a SIGTERM to the running Envoy (which is expected to be PID 1
// since it is the entry point of the container).

int main(int argc, char** argv) {
  if (argc < 3) {
    std::cerr << "Usage: " << argv[0] << " <address> <port>" << std::endl;
    return 1;
  }

  const char* address = argv[1];
  int port = std::stoi(argv[2]);

  // We use `getaddrinfo` over `inet_pton` to support DNS resolution as
  // `address` might be either a hostname or an IP address string.
  struct addrinfo hints, *res;
  memset(&hints, 0, sizeof(hints));
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;
  if (getaddrinfo(address, nullptr, &hints, &res) != 0) {
    perror("Invalid address");
    return 1;
  }

  int s = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
  if (s < 0) {
    perror("Failed to create socket");
    freeaddrinfo(res);
    return 1;
  }

  // Bind socket to the specified address and port.
  struct sockaddr_in* addr = (struct sockaddr_in*) res->ai_addr;
  addr->sin_port = htons(port);

  if (connect(s, res->ai_addr, res->ai_addrlen) < 0) {
    perror("Failed to connect to server");
    close(s);
    freeaddrinfo(res);
    return 1;
  }

  // Read from the socket until EOF or error.
  char buffer[4096];
  ssize_t bytes;
  while ((bytes = read(s, buffer, sizeof(buffer))) > 0) {}

  // Close the socket.
  close(s);
  freeaddrinfo(res);

  // Tell Envoy to terminate! Invariant here is that Envoy is at PID 1
  // since it should be the entry point within the container.
  kill(1, SIGTERM);

  // NOTE: we can't send SIGKILL to PID 1 because it's acting as the
  // 'init' process, so if Envoy doesn't properly handle SIGTERM then
  // we still might have an orphan.

  return 0;
}
