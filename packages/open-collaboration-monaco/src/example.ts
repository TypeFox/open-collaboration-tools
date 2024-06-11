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
		serverUrl: 'localhost:blah:blubb'
	});

	monacoCollabApi.createRoom().then(instance => {
		console.log(instance);
	});
}