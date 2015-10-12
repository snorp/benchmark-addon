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

const NUM_RUNS = 10;

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
  }

  let finish = function() {
    running = false;
    browser.removeEventListener("load", onLoad, true);

    let min = Number.MAX_VALUE;
    let max = 0;
    let sum = 0;

    durations = durations.sort(function(a, b) {
      return a > b;
    });

    durations.forEach(function(duration) {
      if (duration < min) {
        min = duration;
      }
      if (duration > max) {
        max = duration;
      }
      sum += duration;
    });

    let avg = sum / durations.length;
    dump("Benchmark complete: count=" + durations.length + ", min=" + min + ", max=" + max + ", mean=" + avg + ", median=" +
         durations[NUM_RUNS / 2]);
  }

  let onLoad = function(evt) {
    if (evt.target == browser.contentDocument) {
      let duration = aWindow.performance.now() - startTime;
      durations.push(duration);

      count++;
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
