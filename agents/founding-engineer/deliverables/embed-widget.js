/**
 * MyMetaView 4.0 Embed Widget — AIL-123 (P7)
 *
 * Usage:
 *   <script src="https://www.mymetaview.com/embed/embed-widget.js"
 *           data-url="https://example.com/page-to-preview"
 *           data-api-key="sk_..."
 *           async></script>
 *   <div id="mymetaview-preview"></div>
 *
 * Behavior:
 *   - With API key: calls batch API, polls for result, renders preview
 *   - Without key: renders "Try MyMetaView" CTA linking to /demo?url=...
 */
(function () {
  "use strict";

  var CONFIG = {
    baseUrl: "https://www.mymetaview.com",
    apiPath: "/api/v1/demo-v2",
    pollIntervalMs: 5000,
    maxPolls: 24,
    containerId: "mymetaview-preview",
  };

  function getScriptConfig() {
    var script = document.currentScript;
    if (!script) return {};
    var baseUrl = script.getAttribute("data-base-url");
    if (baseUrl) {
      CONFIG.baseUrl = baseUrl.replace(/\/$/, "");
    }
    return {
      url: script.getAttribute("data-url") || "",
      apiKey: script.getAttribute("data-api-key") || "",
      containerId: script.getAttribute("data-container-id") || CONFIG.containerId,
    };
  }

  function getContainer(id) {
    return document.getElementById(id) || document.querySelector("#" + id);
  }

  function renderCTA(url) {
    var demoUrl = CONFIG.baseUrl + "/demo?url=" + encodeURIComponent(url);
    return (
      '<div class="mymetaview-embed cta">' +
      '<a href="' + demoUrl + '" target="_blank" rel="noopener">Try MyMetaView</a>' +
      "<p>Generate a preview of this page</p>" +
      "</div>"
    );
  }

  function renderPreview(previewUrl, sourceUrl) {
    var alt = "Preview of " + (sourceUrl || "page");
    return (
      '<div class="mymetaview-embed preview">' +
      '<img src="' +
      previewUrl +
      '" alt="' +
      alt +
      '" width="1200" height="630" loading="lazy" />' +
      (sourceUrl
        ? '<a href="' +
          sourceUrl +
          '" target="_blank" rel="noopener">View original</a>'
        : "") +
      "</div>"
    );
  }

  function renderLoading() {
    return (
      '<div class="mymetaview-embed loading">' +
      "<p>Generating preview…</p>" +
      "</div>"
    );
  }

  function renderError(msg) {
    return (
      '<div class="mymetaview-embed error">' +
      "<p>Preview unavailable: " + (msg || "Unknown error") + "</p>" +
      "</div>"
    );
  }

  function submitBatch(url, apiKey) {
    return fetch(CONFIG.baseUrl + CONFIG.apiPath + "/batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ urls: [url], quality_mode: "balanced" }),
    }).then(function (r) {
      if (!r.ok) throw new Error("Batch submit failed: " + r.status);
      return r.json();
    });
  }

  function pollStatus(jobId, apiKey) {
    return fetch(
      CONFIG.baseUrl + CONFIG.apiPath + "/batch/" + jobId,
      {
        headers: { "X-Api-Key": apiKey },
      }
    ).then(function (r) {
      if (!r.ok) throw new Error("Status poll failed: " + r.status);
      return r.json();
    });
  }

  function getResults(jobId, apiKey) {
    return fetch(
      CONFIG.baseUrl + CONFIG.apiPath + "/batch/" + jobId + "/results",
      {
        headers: { "X-Api-Key": apiKey },
      }
    ).then(function (r) {
      if (!r.ok) throw new Error("Results fetch failed: " + r.status);
      return r.json();
    });
  }

  function pollForResult(url, apiKey, container) {
    submitBatch(url, apiKey)
      .then(function (data) {
        var jobId = data.job_id;
        if (!jobId) throw new Error("No job_id in response");
        return pollUntilDone(jobId, apiKey);
      })
      .then(function (result) {
        if (result && result.preview_url) {
          container.innerHTML = renderPreview(result.preview_url, result.url);
        } else {
          container.innerHTML = renderError(
            (result && result.error) || "Preview generation failed"
          );
        }
      })
      .catch(function (err) {
        container.innerHTML = renderError(err.message);
      });
  }

  function pollUntilDone(jobId, apiKey) {
    var attempts = 0;
    function poll() {
      attempts++;
      return pollStatus(jobId, apiKey).then(function (status) {
        if (status.status === "completed" || status.status === "failed") {
          return getResults(jobId, apiKey).then(function (res) {
            var first = (res.result_urls || [])[0];
            return first || null;
          });
        }
        if (attempts >= CONFIG.maxPolls) {
          return Promise.reject(new Error("Timeout waiting for result"));
        }
        return new Promise(function (resolve) {
          setTimeout(function () {
            poll().then(resolve).catch(resolve);
          }, CONFIG.pollIntervalMs);
        });
      });
    }
    return poll();
  }

  function init() {
    var cfg = getScriptConfig();
    var container = getContainer(cfg.containerId);
    if (!container) return;

    if (!cfg.url) {
      container.innerHTML = renderError("Missing data-url attribute");
      return;
    }

    if (cfg.apiKey) {
      container.innerHTML = renderLoading();
      pollForResult(cfg.url, cfg.apiKey, container);
    } else {
      container.innerHTML = renderCTA(cfg.url);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
