# v8-riscv CI Tool

This directory defines a server which listens for webhooks from GitHub to trigger a build and test procedure. It performs the following checks:

* The repository is `v8-riscv/v8`
* The review state is **approved**
* The reviewer is in the list of approved reviewers

These conditions are in place to ensure that the process only runs on code that has been reviewed by a trusted developer.

The tool sends status to GitHub using the context `ci`. This can be used to in the branch protection rules to specify that a PR may not be merged unless this process has run successfully.

When it sends this status, it includes a link to the output from the command, so that we may check the errors or see the results.

## Usage

### Prerequisites

This tool is built in Node.js, so you will need to ensure that is installed. You can install it via your OS's [package manager](https://nodejs.org/en/download/package-manager/#debian-and-ubuntu-based-linux-distributions-enterprise-linux-fedora-and-snap-packages) or by [downloading a installer](https://nodejs.org/en/download/).

It also uses docker to build and run the tests, so you will need to have [docker installed](https://docs.docker.com/get-docker/) as well.

### Setup

First, you must define the following environment variables or create a file, `.env`, which stores the sensitive data:

```
BASE_URL=<URL-of-this-server>
WEBHOOK_SECRET=<my-secret>
GITHUB_TOKEN=<my-token>
```

The webhook secret must match the value in the GitHub [webhooks settings](https://github.com/v8-riscv/v8/settings/hooks). The GitHub token can be a [personal access token](https://github.com/settings/tokens) that has the *repo:status* permissions for the v8-riscv/v8 repo (to post statuses) and the *read:org* permission for the v8-riscv organization (to read organization members).

Next, make any changes needed to the configuration in `config.json`.

### Run the Server

Start the server using the following commands:
```
npm install
npm start
```

Setup the [webhooks](https://github.com/v8-riscv/v8/settings/hooks) to POST to this server, at the `/hooks` endpoint. If the server is running on a machine that does not have a static IP or is not accessible via the Internet, you may use [ngrok](https://ngrok.com/) to expose it as a public URL.

Optionally daemonize this server using pm2:

```
pm2 start --name v8-ci index.js
pm2 log v8-ci
```
