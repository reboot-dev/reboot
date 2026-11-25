FROM ubuntu@sha256:a2d43bffc46670d7108bb3c0468c67c5557c4c92e83e1e34cbff1322ad1b94dc
COPY rbt /opt/rbt
COPY rbt.runfiles /opt/rbt.runfiles
COPY envoy /usr/local/bin/envoy
COPY example /example
ENV PATH=/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin:/usr/local/bin:/usr/bin:/bin
ENV PYTHONPATH=/example/hello-constructors/backend/api
ENV REBOOT_LOCAL_ENVOY_MODE=executable
WORKDIR /example/hello-constructors
COPY entrypoint.py /usr/local/bin/python-entrypoint.py
ENTRYPOINT ["/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin/python3", "/usr/local/bin/python-entrypoint.py"]
