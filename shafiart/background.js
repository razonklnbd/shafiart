chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "editImageWithCanvas",
    title: "Edit Image with Shafiart",
    contexts: ["image"]
  });
});

// Open editor in a standalone window when the extension toolbar icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: chrome.runtime.getURL("editor.html"),
    type: "popup",
    width: 1200,
    height: 850
  });
});

// Handle right-click context menu selections
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "editImageWithCanvas" && info.srcUrl) {
    try {
      const response = await fetch(info.srcUrl);
      const blob = await response.blob();
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result;
        chrome.storage.local.set({ canvasEditorImage: base64data }, () => {
          chrome.windows.create({
            url: chrome.runtime.getURL("editor.html"),
            type: "popup",
            width: 1200,
            height: 850
          });
        });
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      chrome.storage.local.set({ canvasEditorImage: info.srcUrl }, () => {
        chrome.windows.create({
          url: chrome.runtime.getURL("editor.html"),
          type: "popup",
          width: 1200,
          height: 850
        });
      });
    }
  }
});

