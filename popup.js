/* global browser */

const songProgressElement = document.querySelector("#songProgress");
const listenersSpan = document.querySelector("#listeners span");
const npElementSpan = document.querySelector("#now-playing-text span");
const npEventSpan = document.querySelector("#now-playing-event span");
const npEvent = document.querySelector("#now-playing-event");
const npRequestA = document.querySelector("#now-playing-request a");
const npRequest = document.querySelector("#now-playing-request");
const favToggle = document.querySelector("#favorite-toggle");
const favToggleSVG = document.querySelector("#favorite-toggle svg");

let started;

async function updateInfo() {
  console.debug("updateInfo");
  let data = await browser.runtime.sendMessage({ cmd: "getData" });

  if (typeof data === "undefined") {
    return;
  }

  let duration;

  if (data && data) {
    if (data.song && data.song.duration) {
      duration = data.song.duration;
    }
    if (data.startTime) {
      started = new Date(data.startTime).getTime() / 1000;
    }
    songProgressElement.max = duration;
  }

  /* Sets Current Listners */
  listenersSpan.innerText =
    typeof data.listeners !== "undefined" ? data.listeners : "N/A";

  while (npElementSpan.hasChildNodes()) {
    npElementSpan.removeChild(npElementSpan.lastChild);
  }

  for (let index in data.song.artists) {
    let artist = data.song.artists[index];

    let artistLink = document.createElement("a");
    artistLink.classList.add("artist");
    artistLink.href = `https://listen.moe/artists/${artist.id}`;
    artistLink.target = "_blank";

    const artistName = artist.nameRomaji || artist.name;

    artistLink.appendChild(document.createTextNode(artistName));
    npElementSpan.appendChild(artistLink);

    if (index < data.song.artists.length - 1) {
      npElementSpan.appendChild(document.createTextNode(", "));
    }
  }

  if (data.song.artists.length) {
    npElementSpan.appendChild(document.createTextNode(" - "));
  }

  npElementSpan.appendChild(
    document.createTextNode(data.song.title || "No data")
  );

  npEventSpan.innerText = "";
  npEvent.style.display = "none";

  if (data.requester) {
    npRequestA.innerText = data.requester.displayName;
    npRequestA.setAttribute(
      "href",
      `https://listen.moe/u/${data.requester.username}`
    );
    npRequest.style.display = "block";
  } else {
    npRequestA.innerText = "";
    npRequestA.setAttribute("href", "");
    npRequest.style.display = "none";
  }

  //}
  /**/

  const token = await browser.runtime.sendMessage({ cmd: "getToken" });
  if (token !== null) {
    favToggle.classList.remove("login");

    if (data.song.favorite) {
      favToggleSVG.classList.add("active");
    } else {
      favToggleSVG.classList.remove("active");
    }
  } else {
    favToggle.classList.add("login");
    favToggleSVG.classList.remove("active");
  }
}

/* Does Scrolling Text */
let timeout = setTimeout(autoScroll, 1000);

function getElWidth(el) {
  el = document.querySelector(el);
  let elementCS = getComputedStyle(el);
  return (
    el.offsetWidth -
    (parseFloat(elementCS.paddingLeft) + parseFloat(elementCS.paddingRight))
  );
}

function autoScroll() {
  let time =
    (Math.floor(
      document.querySelector("#now-playing-text span").innerText.length
    ) /
      10) *
    500;
  if (getElWidth("#now-playing-text span") > getElWidth("#now-playing-text")) {
    clearTimeout(timeout);
    let offset =
      getElWidth("#now-playing-text span") +
      1 -
      getElWidth("#now-playing-text");
    document.querySelector(
      "#now-playing-text span"
    ).style.transition = `margin ${time}ms ease-in-out`;
    document.querySelector(
      "#now-playing-text span"
    ).style.marginLeft = `${-offset}px`;
    timeout = setTimeout(() => {
      document.querySelector(
        "#now-playing-text span"
      ).style.transition = `margin ${time / 4}ms ease-in-out`;
      document.querySelector("#now-playing-text span").style.marginLeft = "0px";
      setTimeout(() => {
        timeout = setTimeout(autoScroll, 10000);
      }, time / 4);
    }, time + 3000);
  }
}

document
  .querySelector("#now-playing-text")
  .addEventListener("mouseenter", () => {
    let time =
      (Math.floor(
        document.querySelector("#now-playing-text span").innerText.length
      ) /
        10) *
      500;
    let offset =
      getElWidth("#now-playing-text span") +
      1 -
      getElWidth("#now-playing-text");
    if (
      getElWidth("#now-playing-text span") > getElWidth("#now-playing-text")
    ) {
      clearTimeout(timeout);
      document.querySelector(
        "#now-playing-text span"
      ).style.transition = `margin ${time}ms ease-in-out`;
      document.querySelector(
        "#now-playing-text span"
      ).style.marginLeft = `${-offset}px`;
    }
  });

document
  .querySelector("#now-playing-text")
  .addEventListener("mouseleave", () => {
    let time =
      (Math.floor(
        document.querySelector("#now-playing-text span").innerText.length
      ) /
        10) *
      500;
    document.querySelector(
      "#now-playing-text span"
    ).style.transition = `margin ${time / 4}ms ease-in-out`;
    document.querySelector("#now-playing-text span").style.marginLeft = "0px";
    setTimeout(() => {
      timeout = setTimeout(autoScroll, 10000);
    }, time / 4);
  });

/* Copy Artist and Song Title to Clipboard */
document
  .querySelector("#now-playing-text span")
  .addEventListener("click", function () {
    window.getSelection().selectAllChildren(this);
  });

(async () => {
  /* Initialize Volume Slider */
  const volumeElement = document.querySelector("#volume-slider");

  volumeElement.value = await browser.runtime.sendMessage({ cmd: "getVol" });
  volumeElement.parentElement.setAttribute(
    "style",
    `--volume: ${volumeElement.value}%`
  );

  volumeElement.addEventListener("input", async (e) => {
    await browser.runtime.sendMessage({ cmd: "setVol", arg: +e.target.value });
    volumeElement.parentElement.setAttribute(
      "style",
      `--volume: ${e.target.value}%`
    );
  });

  document
    .querySelector("#radio-volume")
    .addEventListener("wheel", async (e) => {
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

  /* Sets Play/Pause depending on player status */
  if (await browser.runtime.sendMessage({ cmd: "isPlaying" })) {
    document.querySelector("#radio-toggle svg").classList.add("active");
  }

  /* Enable/Disable Player */
  document
    .querySelector("#radio-toggle svg")
    .addEventListener("click", async function () {
      const ret = await browser.runtime.sendMessage({ cmd: "isPlaying" });
      if (ret) {
        this.classList.remove("active");
        await browser.runtime.sendMessage({ cmd: "disable" });
      } else {
        this.classList.add("active");
        await browser.runtime.sendMessage({ cmd: "enable" });
      }
    });

  /* Favorites Button */
  document
    .querySelector("#favorite-toggle")
    .addEventListener("click", async function () {
      if (this.classList.contains("login")) {
        window.open("https://listen.moe", "_blank");
      } else {
        await browser.runtime.sendMessage({ cmd: "toggleFavorite" });
      }
    });

  /* Toggles Radio Type */
  document
    .querySelector("#radio-type-toggle")
    .addEventListener("click", async function () {
      const type = await browser.runtime.sendMessage({ cmd: "toggleType" });
      if (type === "KPOP") {
        this.innerText = "Switch to J-POP";
        document.body.classList.add("kpop");
      } else {
        this.innerText = "Switch to K-POP";
        document.body.classList.remove("kpop");
      }
    });

  /* Opens Settings */
  document.querySelector("#settings").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });

  browser.runtime.onMessage.addListener(async (data /*, sender*/) => {
    switch (data.cmd) {
      case "songChanged":
      case "favSong":
        updateInfo();
        break;
      default:
        break;
    }
  });

  updateInfo();

  // update songProgress
  setInterval(() => {
    let val = Date.now() / 1000 - started;
    songProgressElement.value = val;
  }, 500);
})();
