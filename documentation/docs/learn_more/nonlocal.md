# Non-local development

Reboot provides an [excellent local development
experience](/develop_locally#running-your-app-for-development), allowing you to
develop apps on your machine that seamlessly transfer to production. For some
applications, however, purely local development is not sufficient. You may for
example want to try your Reboot application on your phone, or you may want to
test it with somebody who is not sitting at your computer.

## Deploying to a dedicated testing environment
You may [deploy your Reboot application](/deploy_operate/where) to a testing
environment. This works just like deploying to production, but the deployment is
kept private (typically by using a different domain name).

This approach gives you a production-like environment to test with, but does not
support convenient features like live-updating of your application.

## Tunnels
You can use a third-party "development tunnel" like [ngrok](#ngrok) to give your
normal local development environment an internet-public URL. How to configure
these tunnels is dependent on the tunnel service you choose.

The instructions below assume that you are [running a Reboot development
instance](/develop_locally#running-your-app-for-development) on port `9991`,
and that you are running a local development web server for the frontend on port
`3000`.

### ngrok

Before you begin:
1. Make sure you are signed up on [ngrok.com](https://ngrok.com).
2. Install the `ngrok` CLI on the machine that runs `rbt dev run`. Follow the
   instructions on `ngrok.com` to store your credentials in an `ngrok.yml` file
   outside of your repo.

To begin, create an additional `ngrok.yml` configuration file inside your repo:
```yaml
# Note that this configuration file, which gets checked into your repo,
# does NOT contain your secret ngrok auth token!
version: 2
tunnels:
  frontend:
    addr: 3000
    proto: http
  backend:
    addr: 9991
    proto: http
```

Then, from your repo, run the following:
```sh
ngrok start --config ./ngrok.yml,/PATH/TO/YOUR/SECRET/ngrok.yml --all
```
Note that this uses two config files: the first is the one for your project, the
second config is the default `ngrok` config file you created during `ngrok`
setup, and which contains your secret auth token.

`ngrok` will now show two public URLs: one for your frontend, and one for your
backend.

:::info
If you are not a paying customer of `ngrok`, you must now visit each of the URLs in
your web browser to accept traffic being sent to them. You must do this for
_both_ URLs, else your app won't work!
:::

You may now [update your frontend to use the
tunnel](#changing-the-backend-url-in-the-frontend), allowing you to access your
application from anywhere.

### Changing the backend URL in the frontend

No matter what tunnel service you've chosen, it will have given you a new
hostname and port for your application. You will use this hostname and port into
your frontend's `.env` file, replacing `http://localhost:9991`. For example:
```
VITE_REBOOT_URL=https://43ee-20-61-126-210.ngrok-free.app
```

You may need to restart your development webserver (e.g. the `npm start`
command) before changes to the `.env` file take effect.

Now your frontend will access the backend via the tunnel host you've provided,
making it accessible anywhere on the internet!
