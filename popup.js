/* global browser */

const popupurl = browser.runtime.getURL("popup.html");
const nowPlayingTextSPAN = document.querySelector("#now-playing-text span");
const nowPlayingText = document.querySelector("#now-playing-text");
const radioToggleSVG = document.querySelector("#radio-toggle svg");
const songProgress = document.querySelector("#songProgress");
const listenersSPAN = document.querySelector("#listeners span");
const nowPlayingEventSPAN = document.querySelector("#now-playing-event span");
const nowPlayingEvent = document.querySelector("#now-playing-event");
const nowPlayingRequestA = document.querySelector("#now-playing-request a");
const nowPlayingRequest = document.querySelector("#now-playing-request");
const favoriteToggle = document.querySelector("#favorite-toggle");
const favoriteToggleSVG = document.querySelector("#favorite-toggle svg");
const detach = document.querySelector("#detach");
const volumeElement = document.querySelector("#volume-slider");
const radioVolume = document.querySelector("#radio-volume");
const radioTypeToggle = document.querySelector("#radio-type-toggle");
const settings = document.querySelector("#settings");
const numberProgressSPAN = document.querySelector("#numberProgress span");
const character = document.querySelector("#character");

let delayed_updateInfo_timerId;
let started = -1;
let duration = -1;
let albumurl = null;

function delayed_updateInfo() {
  clearTimeout(delayed_updateInfo_timerId);
  setTimeout(updateInfo, 500);
}

async function updateInfo() {
  // get new data
  const getType = await browser.runtime.sendMessage({ cmd: "getType" });
  const isPlaying = await browser.runtime.sendMessage({ cmd: "isPlaying" });
  const getData = await browser.runtime.sendMessage({ cmd: "getData" });
  const getVol = await browser.runtime.sendMessage({ cmd: "getVol" });
  const getToken = await browser.runtime.sendMessage({ cmd: "getToken" });

  // save cover url for onclick callback
  if (
    getData &&
    getData.song &&
    getData.song.albums &&
    getData.song.albums.length > 0 &&
    getData.song.albums[0].id &&
    typeof getData.song.albums[0].id === "number" &&
    getData.song.albums[0].id > 0
  ) {
    albumurl = `https://listen.moe/albums/${getData.song.albums[0].id}`;
  } else {
    albumurl = null;
  }

  // set page style
  if (getType === "KPOP") {
    radioTypeToggle.innerText = "Switch to J-POP";
    document.body.classList.add("kpop");
  } else {
    radioTypeToggle.innerText = "Switch to K-POP";
    document.body.classList.remove("kpop");
  }

  // set volume
  volumeElement.value = getVol;
  volumeElement.parentElement.setAttribute("style", `--volume: ${getVol}%`);

  // Sets Play/Pause depending on player status
  if (isPlaying) {
    radioToggleSVG.classList.add("active");
  } else {
    radioToggleSVG.classList.remove("active");
  }

  // set album cover
  if (
    getData.song &&
    typeof getData.song.coverData === "string" &&
    getData.song.coverData !== "null"
  ) {
    character.style.background = `url(${getData.song.coverData}) no-repeat center`;
    character.style["background-size"] = "cover";
    character.style["cursor"] = "pointer";
  } else {
    character.style.background = `url(/kanna.gif) no-repeat center`;
    character.style["background-size"] = "cover";
    character.style["cursor"] = "auto";
  }

  // set current song duration
  if (
    getData.song &&
    typeof getData.song.duration === "number" &&
    getData.song.duration >= 0
  ) {
    duration = getData.song.duration;
  } else {
    duration = -1;
  }

  // set current song start time
  if (getData.song && typeof getData.startTime === "string") {
    started = new Date(getData.startTime).getTime() / 1000;
  } else {
    started = -1;
  }

  // set songProgress
  songProgress.max = duration > 0 ? duration : 1;
  songProgress.value = duration > 0 ? duration : 0;

  // set listeners */
  if (typeof getData.listeners === "number") {
    listenersSPAN.innerText = getData.listeners;
  } else {
    listenersSPAN.innerText = "N/A";
  }

  // set/nowPlaying
  nowPlayingTextSPAN.innerHTML = "";
  /*
  while (nowPlayingTextSPAN.hasChildNodes()) {
    nowPlayingTextSPAN.removeChild(nowPlayingTextSPAN.lastChild);
  }
  */

  for (let index in getData.song.artists) {
    let artist = getData.song.artists[index];

    let artistLink = document.createElement("a");
    artistLink.classList.add("artist");
    artistLink.href = `https://listen.moe/artists/${artist.id}`;
    artistLink.target = "_blank";

    const artistName = artist.nameRomaji || artist.name;

    artistLink.appendChild(document.createTextNode(artistName));
    nowPlayingTextSPAN.appendChild(artistLink);

    if (index < getData.song.artists.length - 1) {
      nowPlayingTextSPAN.appendChild(document.createTextNode(", "));
    }
  }

  if (getData.song.artists.length) {
    nowPlayingTextSPAN.appendChild(document.createTextNode(" - "));
  }

  nowPlayingTextSPAN.appendChild(
    document.createTextNode(getData.song.title || "No data")
  );

  if (getData.event && getData.event.name) {
    nowPlayingRequestA.innerText = "";
    nowPlayingRequestA.setAttribute("href", "");
    nowPlayingRequest.style.display = "none";

    nowPlayingEventSPAN.innerText = getData.event.name;
    nowPlayingEvent.style.display = "block";
  } else {
    nowPlayingEventSPAN.innerText = "";
    nowPlayingEvent.style.display = "none";

    if (
      getData.requester &&
      getData.requester.displayName &&
      getData.requester.username
    ) {
      nowPlayingRequestA.innerText = getData.requester.displayName;
      nowPlayingRequestA.setAttribute(
        "href",
        `https://listen.moe/u/${getData.requester.username}`
      );
      nowPlayingRequest.style.display = "block";
    } else {
      nowPlayingRequestA.innerText = "";
      nowPlayingRequestA.setAttribute("href", "");
      nowPlayingRequest.style.display = "none";
    }
  }

  // update favorit star
  if (getToken) {
    favoriteToggle.classList.remove("login");
    if (getData.song.favorite) {
      favoriteToggleSVG.classList.add("active");
    } else {
      favoriteToggleSVG.classList.remove("active");
    }
  } else {
    favoriteToggleSVG.classList.remove("active");
    favoriteToggle.classList.add("login");
  }
}

// scrolling song info
let timeout = setTimeout(autoScroll, 1000);

function getElWidth(el) {
  let elementCS = getComputedStyle(el);
  return (
    el.offsetWidth -
    (parseFloat(elementCS.paddingLeft) + parseFloat(elementCS.paddingRight))
  );
}

function autoScroll() {
  let time = (Math.floor(nowPlayingTextSPAN.innerText.length) / 10) * 500;
  if (getElWidth(nowPlayingTextSPAN) > getElWidth(nowPlayingText)) {
    clearTimeout(timeout);
    let offset =
      getElWidth(nowPlayingTextSPAN) + 1 - getElWidth(nowPlayingText);
    nowPlayingTextSPAN.style.transition = `margin ${time}ms ease-in-out`;
    nowPlayingTextSPAN.style.marginLeft = `${-offset}px`;
    timeout = setTimeout(() => {
      nowPlayingTextSPAN.style.transition = `margin ${time / 4}ms ease-in-out`;
      nowPlayingTextSPAN.style.marginLeft = "0px";
      setTimeout(() => {
        timeout = setTimeout(autoScroll, 10000);
      }, time / 4);
    }, time + 3000);
  }
}

nowPlayingText.addEventListener("mouseenter", () => {
  let time = (Math.floor(nowPlayingTextSPAN.innerText.length) / 10) * 500;
  let offset = getElWidth(nowPlayingTextSPAN) + 1 - getElWidth(nowPlayingText);
  if (getElWidth(nowPlayingTextSPAN) > getElWidth(nowPlayingText)) {
    clearTimeout(timeout);
    nowPlayingTextSPAN.style.transition = `margin ${time}ms ease-in-out`;
    nowPlayingTextSPAN.style.marginLeft = `${-offset}px`;
  }
});

nowPlayingText.addEventListener("mouseleave", () => {
  let time = (Math.floor(nowPlayingTextSPAN.innerText.length) / 10) * 500;
  nowPlayingTextSPAN.style.transition = `margin ${time / 4}ms ease-in-out`;
  nowPlayingTextSPAN.style.marginLeft = "0px";
  setTimeout(() => {
    timeout = setTimeout(autoScroll, 10000);
  }, time / 4);
});

// copy Artist and Song Title to Clipboard
nowPlayingTextSPAN.addEventListener("click", function () {
  window.getSelection().selectAllChildren(this);
});

(async () => {
  // init volume slider
  volumeElement.addEventListener("input", async (e) => {
    await browser.runtime.sendMessage({ cmd: "setVol", arg: +e.target.value });
    volumeElement.parentElement.setAttribute(
      "style",
      `--volume: ${e.target.value}%`
    );
  });

  radioVolume.addEventListener("wheel", async (e) => {
    volumeElement.value =
      e.deltaY < 0 ? +volumeElement.value + 5 : +volumeElement.value - 5;
    await browser.runtime.sendMessage({
      cmd: "setVol",
      arg: +volumeElement.value,
    });
    volumeElement.parentElement.setAttribute(
      "style",
      `--volume: ${volumeElement.value}%`
    );
  });

  // enable/disable player
  radioToggleSVG.addEventListener("click", () => {
    browser.runtime.sendMessage({ cmd: "togglePlayback" });
  });

  // favorite button
  favoriteToggle.addEventListener("click", async () => {
    browser.runtime.sendMessage({ cmd: "toggleFavorite" });
  });

  // toggle stream type
  radioTypeToggle.addEventListener("click", () => {
    browser.runtime.sendMessage({ cmd: "toggleType" });
  });

  // open preferences
  settings.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });

  // open album info page
  character.addEventListener("click", () => {
    if (albumurl !== null) {
      browser.tabs.create({
        url: albumurl,
      });
    }
  });

  // detach into window
  detach.addEventListener("click", () => {
    browser.windows.create({
      focused: true,
      url: popupurl,
      width: 480,
      height: 145,
      type: "panel",
    });
    window.close();
  });

  // listen for update
  browser.runtime.onMessage.addListener(async (data /*, sender*/) => {
    switch (data.cmd) {
      case "updateInfo":
        delayed_updateInfo();
        //updateInfo();
        break;
    }
  });

  // inital update
  updateInfo();

  // update songProgress
  setInterval(() => {
    if (started > 0 && duration > 0) {
      let val = parseInt(Date.now() / 1000 - started);
      if (val < duration) {
        songProgress.value = val;
        numberProgressSPAN.innerText = val + "/" + duration;
        return;
      }
    }
    numberProgressSPAN.innerText = "-/-";
  }, 1000);
})();
