/* global browser*/

let storage = {};

const radioType = {
  JPOP: {
    stream: "https://listen.moe/stream",
    gateway: "wss://listen.moe/gateway_v2",
  },
  KPOP: {
    stream: "https://listen.moe/kpop/stream",
    gateway: "wss://listen.moe/kpop/gateway_v2",
  },
};

let radio = {
  player: createElement("audio", { autoplay: true }),
  async getToken() {
    const tmp = await browser.cookies.get({
      url: "https://listen.moe",
      name: "token",
    });
    if (tmp && tmp.value) {
      return tmp.value;
    }
    return false;
  },
  async enable() {
    this.player.setAttribute("src", radioType[storage.radioType].stream);
  },
  async disable() {
    this.player.setAttribute("src", "");
  },
  togglePlayback() {
    if (this.isPlaying()) {
      this.disable();
    } else {
      this.enable();
    }
    try {
      browser.runtime.sendMessage({
        cmd: "updateInfo",
      });
    } catch (e) {
      // noop ... when popup is not open
    }
    //return storage.radioType;
  },
  getType() {
    return storage.radioType;
  },
  toggleType() {
    storage.radioType = this.getType() === "JPOP" ? "KPOP" : "JPOP";
    browser.storage.local.set({ radioType: storage.radioType });
    if (this.isPlaying()) {
      this.enable();
    }
    try {
      browser.runtime.sendMessage({
        cmd: "updateInfo",
      });
    } catch (e) {
      // noop ... when popup is not open
    }
    //return storage.radioType;
  },
  isPlaying() {
    let tmp = this.player.getAttribute("src");
    return typeof tmp === "string" && tmp.startsWith("https://");
  },
  setVol(volume) {
    if (Number.isInteger(volume) && (volume >= 0 || volume <= 100)) {
      this.player.volume = volume / 100;
      browser.storage.local.set({ volume });
    }
  },
  savePlaying() {
    let link = document.createElement("a");
    link.setAttribute("target", "_blank");
    link.setAttribute("download", this.getData().song.title + ".info");
    link.setAttribute(
      "href",
      "data:text/plain;charset=utf-8,artists: " +
        this.getData()
          .song.artists.map((a) => a.nameRomaji || a.name)
          .join(", ")
    );
    setTimeout(() => {
      link.remove();
    }, 3000);
    link.click();
  },
  showPlaying() {
    createNotification(
      "Now Playing",
      this.getData().song.title,
      this.getData()
        .song.artists.map((a) => a.nameRomaji || a.name)
        .join(", "),
      this.getData().song.coverData
    );
  },
  getVol() {
    return this.player.volume * 100;
  },
  volUp() {
    this.getVol() > 95
      ? this.setVol(100)
      : this.setVol(Math.floor(this.getVol() + 5));
  },
  volDown() {
    this.getVol() < 5
      ? this.setVol(0)
      : this.setVol(Math.floor(this.getVol() - 5));
  },
  getData() {
    return radio.socket[radio.getType()].data;
  },
  async toggleFavorite() {
    try {
      const token = await this.getToken();
      if (!token) {
        browser.tabs.create({
          url: "https://listen.moe",
          active: true,
        });
        return false;
      }
      const headers = new Headers({
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      });
      const { id } = this.getData().song;

      const res = await fetch("https://listen.moe/graphql", {
        method: "POST",
        headers,
        body: JSON.stringify({
          operationName: "favoriteSong",
          query: `
						mutation favoriteSong($id: Int!) {
							favoriteSong(id: $id) {
								id
							}
						}
					`,
          variables: { id },
        }),
      });

      const json = await res.json();
      if (json.data && json.data.favoriteSong && json.data.favoriteSong.id) {
        this.getData().song.favorite =
          json.data.favoriteSong.id == id
            ? !this.getData().song.favorite
            : this.getData().song.favorite;
      } else if (json.errors) {
        console.error(json.errors);
        this.getData().song.favorite = false;
      }
      try {
        browser.runtime.sendMessage({
          cmd: "updateInfo",
        });
      } catch (e) {
        // noop ... when popup is not open
      }
      //return storage.radioType;
    } catch (e) {
      console.error(e);
    }
  },
  async checkFavorite(id) {
    try {
      const token = await this.getToken();
      if (!token) {
        return false;
      }
      const headers = new Headers({
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      });
      const songs = [this.getData().song.id];
      const res = await fetch("https://listen.moe/graphql", {
        method: "POST",
        headers,
        body: JSON.stringify({
          operationName: "checkFavorite",
          query: `
						query checkFavorite($songs: [Int!]!) {
							checkFavorite(songs: $songs)
						}
					`,
          variables: { songs },
        }),
      });
      const json = await res.json();
      console.log(json);
      if (json.data && json.data.checkFavorite) {
        console.log(json.data.checkFavorite);
        return json.data.checkFavorite.includes(id);
      } else if (json.errors) {
        console.error(json.errors);
      }
    } catch (err) {
      console.error(err);
    }
    return false;
  },
  socket: {
    JPOP: {
      heartbeatIntervalTimerId: null,
      ws: null,
      data: { lastSongID: -1 },
      reConnect() {
        clearInterval(radio.socket.JPOP.heartbeatIntervalTimerId);
        setTimeout(radio.socket.JPOP.init, 5000);
      },
      init() {
        radio.socket.JPOP.ws = new WebSocket(radioType["JPOP"].gateway);

        radio.socket.JPOP.ws.onopen = () => {
          clearInterval(radio.socket.JPOP.heartbeatIntervalTimerId);
        };

        radio.socket.JPOP.ws.onclose = this.reConnect;

        radio.socket.JPOP.ws.onmessage = async (message) => {
          try {
            let response = JSON.parse(message.data);
            if (response.op === 0) {
              radio.socket.JPOP.heartbeat(response.d.heartbeat);
              return;
            }
            if (response.op === 1) {
              radio.socket.JPOP.data = response.d;
              radio.socket.JPOP.data.song.favorite = await radio.checkFavorite(
                radio.socket.JPOP.data.song.id
              );

              if (
                Array.isArray(radio.socket.JPOP.data.song.albums) &&
                radio.socket.JPOP.data.song.albums.length > 0 &&
                radio.socket.JPOP.data.song.albums[0].image
              ) {
                const url =
                  "https://cdn.listen.moe/covers/" +
                  encodeURIComponent(
                    radio.socket.JPOP.data.song.albums[0].image
                  );
                const res = await fetch(url, {
                  credentials: "omit",
                  cors: "no-cors",
                });
                const cover = await res.blob();
                radio.socket.JPOP.data.song.coverData = await blobToBase64(
                  cover
                );
              } else {
                radio.socket.JPOP.data.song.coverData = null;
              }
              if (
                !radio.socket.JPOP.data.song.id ||
                radio.socket.JPOP.data.song.id !==
                  radio.socket.JPOP.data.lastSongID
              ) {
                if (
                  radio.socket.JPOP.data.lastSongID !== -1 &&
                  radio.isPlaying() &&
                  radio.getType() === "JPOP" &&
                  storage.enableNotifications
                ) {
                  createNotification(
                    "Now Playing",
                    radio.socket.JPOP.data.song.title,
                    radio.socket.JPOP.data.song.artists
                      .map((a) => a.nameRomaji || a.name)
                      .join(", "),
                    radio.socket.JPOP.data.song.coverData
                  );
                }
                radio.socket.JPOP.data.lastSongID =
                  radio.socket.JPOP.data.song.id;
              }
              // TODO : only send, when this type is active
              // if popup is visible ... tell it to update the infos
              if (radio.getType() === "JPOP") {
                try {
                  await browser.runtime.sendMessage({
                    cmd: "updateInfo",
                  });
                } catch (e) {
                  // noop ... when popup is not open
                }
              }
            }
          } catch (err) {
            console.error(err);
          }
        };
      },
      heartbeat(intvalTime) {
        clearInterval(radio.socket.JPOP.heartbeatIntervalTimerId);
        radio.socket.JPOP.heartbeatIntervalTimerId = setInterval(() => {
          radio.socket.JPOP.ws.send(JSON.stringify({ op: 9 }));
        }, intvalTime);
      },
    },

    KPOP: {
      heartbeatIntervalTimerId: null,
      ws: null,
      data: { lastSongID: -1 },
      reConnect() {
        clearInterval(radio.socket.KPOP.heartbeatIntervalTimerId);
        setTimeout(radio.socket.KPOP.init, 5000);
      },
      init() {
        radio.socket.KPOP.ws = new WebSocket(radioType["KPOP"].gateway);

        radio.socket.KPOP.ws.onopen = () => {
          clearInterval(radio.socket.KPOP.heartbeatIntervalTimerId);
        };

        radio.socket.KPOP.ws.onclose = this.reConnect;

        radio.socket.KPOP.ws.onmessage = async (message) => {
          try {
            let response = JSON.parse(message.data);
            if (response.op === 0) {
              radio.socket.KPOP.heartbeat(response.d.heartbeat);
              return;
            }
            if (response.op === 1) {
              radio.socket.KPOP.data = response.d;
              radio.socket.KPOP.data.song.favorite = await radio.checkFavorite(
                radio.socket.KPOP.data.song.id
              );

              if (
                Array.isArray(radio.socket.KPOP.data.song.albums) &&
                radio.socket.KPOP.data.song.albums.length > 0 &&
                radio.socket.KPOP.data.song.albums[0].image
              ) {
                const url =
                  "https://cdn.listen.moe/covers/" +
                  encodeURIComponent(
                    radio.socket.KPOP.data.song.albums[0].image
                  );
                const res = await fetch(url, {
                  credentials: "omit",
                  cors: "no-cors",
                });
                const cover = await res.blob();
                radio.socket.KPOP.data.song.coverData = await blobToBase64(
                  cover
                );
              } else {
                radio.socket.KPOP.data.song.coverData = null;
              }
              if (
                !radio.socket.KPOP.data.song.id ||
                radio.socket.KPOP.data.song.id !==
                  radio.socket.KPOP.data.lastSongID
              ) {
                if (
                  radio.socket.KPOP.data.lastSongID !== -1 &&
                  radio.isPlaying() &&
                  radio.getType() === "KPOP" &&
                  storage.enableNotifications
                ) {
                  createNotification(
                    "Now Playing",
                    radio.socket.KPOP.data.song.title,
                    radio.socket.KPOP.data.song.artists
                      .map((a) => a.nameRomaji || a.name)
                      .join(", "),
                    radio.socket.KPOP.data.song.coverData
                  );
                }
                radio.socket.KPOP.data.lastSongID =
                  radio.socket.KPOP.data.song.id;
              }
              // if popup is visible ... tell it to update the infos
              if (radio.getType() === "KPOP") {
                try {
                  await browser.runtime.sendMessage({
                    cmd: "updateInfo",
                  });
                } catch (e) {
                  // noop ... when popup is not open
                }
              }
            }
          } catch (err) {
            console.error(err);
          }
        };
      },
      heartbeat(intvalTime) {
        clearInterval(radio.socket.KPOP.heartbeatIntervalTimerId);
        radio.socket.KPOP.heartbeatIntervalTimerId = setInterval(() => {
          radio.socket.KPOP.ws.send(JSON.stringify({ op: 9 }));
        }, intvalTime);
      },
    },
  },
};

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (revt) => {
      var img = document.createElement("img");
      img.onerror = reject;
      img.onload = () => {
        var MAX_WIDTH = 150;
        var MAX_HEIGHT = 150;

        var width = img.width;
        var height = img.height;

        // Change the resizing logic
        if (width > height) {
          if (width > MAX_WIDTH) {
            height = height * (MAX_WIDTH / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = width * (MAX_HEIGHT / height);
            height = MAX_HEIGHT;
          }
        }

        // Dynamically create a canvas element
        var canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext("2d");

        // Actual resizing
        ctx.drawImage(img, 0, 0, width, height);

        // Show resized image in preview element
        var dataurl = canvas.toDataURL("png");
        resolve(dataurl);
      };
      img.src = revt.target.result;
    };
    reader.readAsDataURL(blob);
  });
}

function createNotification(title, message, altText, iconUrl = "icon.svg") {
  let notificationContent = {
    type: "basic",
    title,
    message,
    iconUrl,
  };
  if (altText) {
    message = message + "\n" + altText;
  }
  browser.notifications.create(
    `notification_${Date.now()}`,
    notificationContent
  );
}

function createElement(tag, attrs, styles) {
  let element = document.createElement(tag);
  for (let key in attrs) {
    element.setAttribute(key, attrs[key]);
  }
  for (let key in styles) {
    element.style[key] = styles[key];
  }
  return element;
}

// update storage
async function onStorageChanged() {
  storage = await browser.storage.local.get({
    volume: 50,
    enableAutoplay: false,
    enableNotifications: true,
    radioType: "JPOP",
  });
}

async function onCommand(cmd, arg) {
  await radio[cmd](arg);
  setTimeout(async () => {
    try {
      await browser.runtime.sendMessage({
        cmd: "updateInfo",
      });
    } catch (e) {
      // noop ignore if popup is not open
    }
  }, 500);
}

async function onRuntimeMessage(data) {
  const cmd = data.cmd;
  const arg = data.arg;
  return await radio[cmd](arg);
}

(async () => {
  // load local setting/options/prefs
  await onStorageChanged();

  // init player
  if (typeof storage.volume !== "undefined") {
    radio.setVol(storage.volume);
  }
  if (storage.enableAutoplay) {
    radio.enable();
  }
  //
  radio.socket.JPOP.init();
  radio.socket.KPOP.init();

  // register listeners
  browser.storage.onChanged.addListener(onStorageChanged);
  browser.commands.onCommand.addListener(onCommand);
  browser.runtime.onMessage.addListener(onRuntimeMessage);
})();

browser.browserAction.onClicked.addListener(async (tab, info) => {
  const popupurl = browser.runtime.getURL("popup.html");

  if (info.button === 1) {
    browser.windows.create({
      focused: true,
      url: popupurl,
      width: 480,
      height: 145,
      type: "panel",
    });
  } else {
    browser.browserAction.setPopup({ popup: popupurl });
    browser.browserAction.openPopup({});
  }
});
// EOF
