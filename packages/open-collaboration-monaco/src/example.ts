import * as monaco from "monaco-editor";
import { monacoCollab } from "./monaco-api";

// import "../node_modules/monaco-editor/min/vs/editor/editor.main.css";

const value = /* set from `myEditor.getModel()`: */ `function hello() {
	alert('Hello Blah!');
}`;

const container = document.getElementById("container");
if(container) {
	const myEditor = monaco.editor.create(container, {
		value,
		language: "javascript"
	});

	const monacoCollabApi = monacoCollab(myEditor, {
		serverUrl: 'http://0.0.0.0:8100',
		callbacks: {
			onUserRequestsAccess: (user) => {
				console.log('User requests access', user);
				return Promise.resolve(true);
			},
			onUsersChanged: () => {
				console.log('Users changed');
			}
		}
	});

	monacoCollabApi.createRoom().then(instance => {
		console.log(instance);
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
		monacoCollabApi.joinRoom(roomToken).then(() => {
			console.log('Joined room');
		}
);	});

}
