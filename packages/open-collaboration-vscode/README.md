# Open Collaboration Tools

Open Collaboration Tools is a collection of open source tools, libraries and extensions for live-sharing of IDE contents, designed to boost remote teamwork with open technologies.

This is how it works: one person starts a collaboration session as host and invites others to join. The IDE extension distributes the contents of the hostʼs workspace and highlights text selections and cursor positions of other participants. In parallel, they get together in their favorite meeting or chat app for immediate discussion. All participants see what the others are looking at and and what changes they propose in real-time. This way of remote collaboration reduces confusion and maximizes productivity.

What's special about Open Collaboration Tools is that it's fully open source under the MIT license, and that it offers libraries to extend the approach on multiple levels: custom editors, custom IDE integrations, or even web applications.

For more information about this project, please [read the announcement](https://www.typefox.io/blog/open-collaboration-tools-announcement/).

## Server Configuration

This extension needs a server instance to which all participants of a collaboration session connect. The server URL is configured with the setting `oct.serverUrl`. Its default is set to `https://api.open-collab.tools/`, which is a public instance operated by [TypeFox](https://www.typefox.io/). TypeFox offers this service with the intent to demonstrate the capabilities of the project and to support open source communities with it. However, we recommend all companies who wish to adopt this technology to deploy their own instance of it, secured with their existing access restrictions.

Usage of the public instance is bound to its [Terms of Use](https://www.open-collab.tools/tos/). Please read them carefully and use our [Discussions](https://github.com/TypeFox/open-collaboration-tools/discussions) for any questions.

## Using the Extension
This extension contributes support for the [Open Collaboration Protocol](https://open-collab.tools).

## Quickstart

The extension adds a new "Share" item to the Status bar at the bottom of vscode, which allows managing your current sessions.  
// Insert Image

### Hosting a session

1. Click on the share item in the status bar
2. A quickpick will open at the top where you should select "Create New Collaboration Session"
3. If you are not already authenticated with the configured server, your browser should open with an authentication page. Follow the steps to authenticate yourself
4. When the authentication was successful a message should appear in the bottom right with a room token. Share that with whoever you wish to join your session
5. should you need to copy the token again click the "Sharing" item in the bottom toolbar again. A quickpick will open again allowing you to copy the token again or close the current session
6. When a user requests to join a message will appear at the bottom prompting you to allow or decline the join request

### Joining

1. After you aquired a room token, click on the share item in the status bar
2. A quickpick will open prompting you to input 
3. If you are not already authenticated with configured server your browser should open with an authentication page. Follow the steps to authenticate yourself
4. That's it! After that VSCode will connect to the hosts session
5. If you want to leave the session, click the "Connected" item in the status bar and select "Close Current Session" to leave the session.

### Session UI

After joining or hosting a session you will find a new "Current Collaboration Session" widget in the explorer tab. 
This widget lists all joined users and their respecive cursor colors. 

Through the follwo icon you can jump to another user and automaticly follow them when they the active file file 
