# ==============================================================================
# Dockerfile to test a branch from a PR
# Pass PR number when building:
#   docker build --build-arg pr_num=NNN .
# ==============================================================================

FROM ubuntu:bionic as v8-base

RUN apt-get update && apt-get upgrade -yqq

RUN DEBIAN_FRONTEND=noninteractive \
    apt-get -yqq install git \
                         curl \
                         python \
                         lsb-release \
                         pkg-config \
                         tzdata \
                         sudo

RUN git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git

ENV PATH="/depot_tools:${PATH}"

RUN fetch v8

RUN (cd /v8 && ./build/install-build-deps.sh --no-prompt --no-arm)


FROM v8-base as v8-riscv

ARG repo=v8-riscv/v8
ENV GITHUB_REPOSITORY=$repo
ARG pr_num=1
ENV PR_NUM=$pr_num
ARG sha=xxx

COPY commit-msg-check.sh /root/commit-msg-check.sh
WORKDIR /v8
RUN (git remote add riscv https://github.com/${GITHUB_REPOSITORY} && \
     git fetch riscv pull/${PR_NUM}/head:ci-${PR_NUM} && \
     git checkout ci-${PR_NUM})


FROM v8-riscv as v8-precheck
RUN git fetch riscv riscv64
RUN bash /root/commit-msg-check.sh riscv/riscv64 $(git log --format="%H" -n 1)
RUN apt install python-pip
RUN pip install coverage
RUN pip pip install numpy
RUN pip install mock
RUN python tools/v8_presubmit.py --no-linter-cache
RUN gclient sync --with_branch_heads --with_tags


FROM v8-riscv as v8-build

RUN ./tools/dev/gm.py riscv64.debug.all --progress=verbose


FROM v8-build as v8-run

RUN ./tools/dev/gm.py riscv64.debug.checkall --progress=verbose
