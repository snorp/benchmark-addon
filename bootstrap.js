"use strict";

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Log",
  "resource://gre/modules/AndroidLog.jsm", "AndroidLog");

// Define the "dump" function as a binding of the Log.d function so it specifies
// the "debug" priority and a log tag.
function dump(msg) {
  Log.d("Browser", msg);
}

const NUM_RUNS = 100;

let running = false;

function showToast(aWindow) {
  aWindow.NativeWindow.toast.show(Strings.GetStringFromName("toast.message"), "short");
}

function startBenchmark(aWindow) {
  if (running) {
    dump("Already running a benchmark!");
    return;
  }

  running = true;
  let browser = aWindow.BrowserApp.selectedBrowser;
  let count = 0;

  let startTime = 0;
  let durations = [];

  let reload = function() {
    let webNav = browser.webNavigation;
    try {
      let sh = webNav.sessionHistory;
      if (sh)
        webNav = sh.QueryInterface(Ci.nsIWebNavigation);
    } catch (e) {}
    startTime = aWindow.performance.now();
    webNav.reload(Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY | Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE);
    dump("Benchmark reloading: count=" + count + "/" + NUM_RUNS);
  }

  let finish = function() {
    running = false;
    browser.removeEventListener("load", onLoad, true);

    durations = durations.sort((a, b) => a > b);
    let num = durations.length;
    let sum = durations.reduce((res, next) => res + next);
    let avg = Math.round(sum / num);

    let stdDev = Math.round(Math.sqrt(durations.reduce((res, next) => res + Math.pow(next - avg, 2)) / num));

    dump("Benchmark complete: count=" + num +
         ", min=" + durations[0] + ", max=" + durations[num - 1] +
         ", mean=" + avg + ", median=" + durations[num / 2] +
         ", std-dev=" + stdDev + " (" + Math.round(stdDev / avg * 100) + "%)");
  }

  let onLoad = function(evt) {
    if (evt.target == browser.contentDocument) {
      let duration = aWindow.performance.now() - startTime;
      durations.push(Math.round(duration));
      count++;
      dump("Benchmark onLoad: count=" + count + "/" + NUM_RUNS + ", duration=" +
           duration);

      if (count < NUM_RUNS) {
        aWindow.setTimeout(function() {
          reload();
        }, 1000);
      } else {
        finish();
      }
    }
  };

  browser.addEventListener("load", onLoad, true);
  reload();
}

var gStartMenuId = null;

function loadIntoWindow(window) {
  gStartMenuId = window.NativeWindow.menu.add("Start Benchmark", null, function() { startBenchmark(window); });
}

function unloadFromWindow(window) {
  window.NativeWindow.menu.remove(gStartMenuId);
}

/**
 * bootstrap.js API
 */
var windowListener = {
  onOpenWindow: function(aWindow) {
    // Wait for the window to finish loading
    let domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
            .getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
    function loadListener() {
      domWindow.removeEventListener("load", loadListener, false);
      loadIntoWindow(domWindow);
    };
    domWindow.addEventListener("load", loadListener, false);
  },
  
  onCloseWindow: function(aWindow) {
  },
  
  onWindowTitleChange: function(aWindow, aTitle) {
  }
};

function startup(aData, aReason) {
  // Load into any existing windows
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    loadIntoWindow(domWindow);
  }

  // Load into any new windows
  Services.wm.addListener(windowListener);
}

function shutdown(aData, aReason) {
  // When the application is shutting down we normally don't have to clean
  // up any UI changes made
  if (aReason == APP_SHUTDOWN) {
    return;
  }

  // Stop listening for new windows
  Services.wm.removeListener(windowListener);

  // Unload from any existing windows
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    unloadFromWindow(domWindow);
  }
}

function install(aData, aReason) {
}

function uninstall(aData, aReason) {
}
