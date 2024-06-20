# Open Collaboration Server

This repository host implementations of the open collaboration protocol.

## Open Collaboration Tools Extension

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/typefox.open-collaboration-tools?label=VS-Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=typefox.open-collaboration-tools)

## Build

Build all packages:

```shell
npm i
npm run build
```

Launch the server application:

```shell
npm run start
```

## Deployment

Build the container image:

```shell
docker compose build
```

Launch the server from inside the container

```shell
docker compose up -d
```
