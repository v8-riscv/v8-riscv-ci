# v8-riscv CI Tool

This directory defines a server which listens for webhooks from GitHub to trigger a build and test procedure. It performs the following checks:

* The repository is `v8-riscv/v8`
* The review state is **approved**
* The reviewer is in the list of approved reviewers

These conditions are in place to ensure that the process only runs on code that has been reviewed by a trusted developer.

The tool sends status to GitHub using the context `ci`. This can be used to in the branch protection rules to specify that a PR may not be merged unless this process has run successfully.

When it sends this status, it includes a link to the output from the command, so that we may check the errors or see the results.

## Usage

### Setup

First, you must create a file, `.env` which stores the sensitive data:

```
BASE_URL=<URL-of-this-server>
WEBHOOK_SECRET=<my-secret>
GITHUB_TOKEN=<my-token>
```

The webhook secret must match the value in the GitHub [webhooks settings](https://github.com/v8-riscv/v8/settings/hooks). The GitHub token can be a [personal access token](https://github.com/settings/tokens) that has the *repo:status* permissions for the v8-riscv/v8 repo.

Next, make any changes needed to the configuration in `config.json`. You'll need to add approvers to the list if nothing else. These should be the GitHub user names of people whose approval will trigger the CI job.

### Run the Server

Start the server using the following commands:
```
npm install
npm start
```

Setup the [webhooks](https://github.com/v8-riscv/v8/settings/hooks) to POST to this server, at the `/hooks` endpoint. If the server is running on a machine that does not have a static IP or is not accessible via the Internet, you may use [ngrok](https://ngrok.com/) to expose it as a public URL.