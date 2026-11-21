import { unzip } from "./lib/fflate.js";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const parser = new DOMParser();
const blobUrls = {};

const btn = document.getElementById("btn");
const fileInput = document.getElementById("file-input");

const types = {
	"gitattributes": "text/plain",
	"html": "text/html",
	"css": "text/css",
	"js": "text/javascript",
	"svg": "image/svg+xml",
	"webp": "image/webp",
	"ico": "image/vnd.microsoft.icon",
	"txt": "text/plain"
};

const fetchScript = `
	function getBlobUrl(relPath) {
		const url = new URL(relPath, window.parent.location.origin);
		return window.parent.blobUrls[url.pathname];
	}

	const originalFetch = window.fetch;
	window.fetch = async (resource, options) => {
		console.log(\`Fetch intercepted: \${resource}\`);
		const blobUrl = getBlobUrl(resource)
		return await originalFetch.call(window, blobUrl, options);
	};
`.trim();

let loading = false;

btn.addEventListener("click", () => {
	if (!loading) {
		loading = true;
		fileInput.click();
	}
});

fileInput.addEventListener("cancel", () => {
	loading = false;
});

fileInput.addEventListener("change", () => {
	if (fileInput.files.length !== 1) {
		loading = false;
	}

	btn.style.display = "none";
	load(fileInput.files[0]);
});

export async function fetchBlobUrl(path) {
	return await fetch(blobUrls[path]);
}

function createBlobUrl(file) {
	const path = file.path;
	console.log(`Loading: ${path}`);
	blobUrls[path] = URL.createObjectURL(new Blob([file.value], { type: file.type }));
}

function getBlobUrl(absPath) {
	const url = new URL(absPath);
	return blobUrls[url.pathname];
}

function assetPass(assetFiles) {
	for (const file of assetFiles) {
		createBlobUrl(file);
	}
}

function cssPass(cssFiles) {
	for (const file of cssFiles) {
		const decoded = decoder.decode(file.value);

		const result = decoded.replaceAll(
			/url\((['"])(.*?)\1\)/g,
			(_match, quote, url) => {
				console.log(url)
				const newUrl = new URL(url, location.origin + file.path);
				const blobUrl = blobUrls[newUrl.pathname];
				return `url(${quote}${blobUrl}${quote})`;
			}
		);

		file.value = encoder.encode(result);

		createBlobUrl(file);
	}
}

function htmlPass(htmlFiles) {
	for (const file of htmlFiles) {
		const decoded = decoder.decode(file.value);
		const doc = parser.parseFromString(decoded, "text/html");

		for (const element of doc.querySelectorAll("[href]")) {
			element.href = getBlobUrl(element.href);
		}

		for (const element of doc.querySelectorAll("[src]")) {
			element.src = getBlobUrl(element.src);
		}

		const script = document.createElement("script");
		script.textContent = fetchScript;
		doc.head.prepend(script);

		file.value = encoder.encode(`<!DOCTYPE html>${doc.documentElement.outerHTML}`);

		createBlobUrl(file);
	}
}

function defineProperty(obj, prop, descriptor) {
	const originalDescriptor = Object.getOwnPropertyDescriptor(obj, prop);
	Object.defineProperty(obj, prop, { ...originalDescriptor, ...descriptor });
}

async function load(data) {
	const bytes = new Uint8Array(await data.arrayBuffer());
	const files = await new Promise((resolve, reject) => {
	    unzip(bytes, (err, files) => {
			if (err) {
				reject(err);
			} else {
				resolve(files);
			}
		});
	});

	const assetFiles = [];
	const cssFiles = [];
	const htmlFiles = [];

	for (const [key, value] of Object.entries(files)) {
		if (key.endsWith("/")) {
			continue;
		}

		const path = key.slice(key.indexOf("/"));
		const ext = path.slice(path.lastIndexOf(".") + 1);
		const type = types[ext];
		const entry = { value, path, ext, type };

		if (type === undefined) {
			if (false) {
				throw new Error(`No media type for ${ext}`);
			} else {
				entry.type = "application/octet-stream";
			}
		}



		if (ext === "html") {
			htmlFiles.push(entry);
		} else if (ext === "css") {
			cssFiles.push(entry);
		} else {
			assetFiles.push(entry);
		}
	}

	assetPass(assetFiles);
	cssPass(cssFiles);
	htmlPass(htmlFiles);

	window.blobUrls = blobUrls;
	const site = document.createElement("iframe");
	const response = await fetch(blobUrls["/index.html"]);
	site.srcdoc = await response.text();
	document.body.appendChild(site);
}
