FROM ubuntu@sha256:a2d43bffc46670d7108bb3c0468c67c5557c4c92e83e1e34cbff1322ad1b94dc
COPY database /usr/local/bin/database
COPY libstdc++.so.6 libgcc_s.so.1 /usr/lib/x86_64-linux-gnu/
COPY probe /usr/local/bin/hello-health
ENV RBT_RUST_URL=http://127.0.0.1:20000
HEALTHCHECK --interval=2s --timeout=4s --start-period=5s --retries=2 CMD ["/usr/local/bin/hello-health", "database-health"]
ENTRYPOINT ["/usr/local/bin/database"]
