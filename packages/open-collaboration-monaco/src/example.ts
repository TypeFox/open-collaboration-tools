import * as monaco from "monaco-editor";
import { monacoCollab } from "./monaco-api";
import { User } from "open-collaboration-protocol";


const value = '';

// /* set from `myEditor.getModel()`: */ `function hello() {
// 	alert('Hello Blah!');
// }`;

const container = document.getElementById("container");
if(container) {
	const myEditor = monaco.editor.create(container, {
		value,
		language: "javascript"
	});

	const monacoCollabApi = monacoCollab(myEditor, {
		serverUrl: 'http://0.0.0.0:8100',
		callbacks: {
			onUserRequestsAccess: (user: User) => {
				console.log('User requests access', user);
				return Promise.resolve(true);
			},
			onUsersChanged: () => {
				console.log('Users changed');
			}
		}
	});

	// on click of button with id create create room, call createRoom, take the value from response and set it in textfield with id token
	const createRoomButton = document.getElementById("create");
	createRoomButton?.addEventListener("click", () => {
		monacoCollabApi.createRoom().then(instance => {
			console.log(instance);
			if (instance) {
				(document.getElementById("token") as HTMLInputElement).value = instance.roomToken ?? '';
			}
		});
	});

	// on click of join room button take value from textfield with id room and call joinRoom
	const joinRoomButton = document.getElementById("join");
	joinRoomButton?.addEventListener("click", () => {
		const roomToken = (document.getElementById("room") as HTMLInputElement).value;
		monacoCollabApi.joinRoom(roomToken).then(state => {
                if(state && state.accessGranted) {
                    console.log('Joined room');
                } else if(state)  {
                    console.log('Access denied:', state.reason);
                }
        });
    });

    // on click of button with id login call login
    const loginButton = document.getElementById("login");
    loginButton?.addEventListener("click", () => {
        monacoCollabApi.login().then((user?: User) => {
            let loginText = 'Failed to login';
            if(user) {
                loginText = 'Logged in as ' + user.name;
            }
            document.getElementById("user")!.innerText = loginText;
        });
    });
}
