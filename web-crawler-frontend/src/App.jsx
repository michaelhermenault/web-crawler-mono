import React, { useState, useEffect, useRef, useCallback } from "react";
import { CrawlGraph } from "./CrawlGraph";
import { CrawlForm } from "./CrawlForm";
import axios from "axios";
import "./index.css"

const pollingPeriod = 2000;
const animationPeriod = 50;
const animationTimeScale = 3;

function createImageContainerForDomain(domain) {
  let img = new Image();
  let imgContainer = { imgLoaded: false, image: img };

  img.onload = function () {
    imgContainer.imgLoaded = true;
  };
  img.src = "https://www.google.com/s2/favicons?domain=" + domain;

  return imgContainer;
}

function getDomain(url) {
  return url.replace(/https?:\/\//, "").split(/[/?#]/)[0];
}

function sanitizeURL(url) {
  return url.replace(/(^\w+:|^)\/\/(www\.)?/, "");
}

function allBeforeTime(links, targetTime) {
  let start = 0;
  let end = links.length - 1;
  let ans = -1;
  while (start <= end) {
    let mid = Math.floor((start + end) / 2);

    // Move to the left side if the target is smaller
    if (links[mid].timeFound >= targetTime) {
      end = mid - 1;
    }

    // Move right side
    else {
      ans = mid;
      start = mid + 1;
    }
  }

  return ans;
}

const baseURL = "http://localhost:8080";

function App() {
  // State
  const [submitState, setSubmitState] = useState("NOINPUT");
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });

  // Refs for instance variables that need to persist between renders
  const existingNodesRef = useRef(new Set());
  const existingEdgesRef = useRef(new Set());
  const babyLinksRef = useRef([]);
  const startingURLRef = useRef("");
  const startTimeRef = useRef(0);

  // Initialize refs on mount
  useEffect(() => {
    existingNodesRef.current = new Set();
    existingEdgesRef.current = new Set();
    babyLinksRef.current = [];
  }, []);

  const startCrawl = useCallback((startingURL) => {
    axios
      .post(baseURL + "/crawl", {
        url: "http://" + startingURL,
      })
      .then((res) => {
        fetchFirstCrawlResults(res.data.resultsURL);
      });
  }, []);

  // Special case for first results fetched. Handles error cases and sets animation timings.
  const fetchFirstCrawlResults = useCallback((resultsURL) => {
    axios.get(resultsURL).then((res) => {
      // We've actually retrieved some results
      if (res.data.edges.length > 0) {
        if (
          res.data.hasOwnProperty("_links") &&
          res.data._links.hasOwnProperty("next")
        ) {
          // Fetch the next set of data.

          startTimeRef.current = Date.now();
          queueCrawlResults(res.data.edges);
          setTimeout(
            () => fetchCrawlResults(res.data._links.next.href),
            pollingPeriod
          );
          displayCrawlResults();
          setSubmitState("VALIDATED");
        } else {
          setSubmitState("ERROR");
        }
      } else {
        setTimeout(
          () => fetchFirstCrawlResults(res.data._links.next.href),
          pollingPeriod
        );
      }
    });
  }, []);

  // Gets a batch of results from the API and queues the next batch if there are any remaining.
  const fetchCrawlResults = useCallback((resultsURL) => {
    axios.get(resultsURL).then((res) => {
      if (
        res.data.hasOwnProperty("_links") &&
        res.data._links.hasOwnProperty("next")
      ) {
        // Fetch the next set of data.
        setTimeout(
          () => fetchCrawlResults(res.data._links.next.href),
          pollingPeriod
        );
      }
      queueCrawlResults(res.data.edges);
    });
  }, []);

  // Turns raw results from API into frames to be displayed
  const queueCrawlResults = useCallback((newResults) => {
    for (const result of newResults) {
      for (const child of result.Children) {
        let imgContainer = createImageContainerForDomain(getDomain(child));

        babyLinksRef.current.push({
          source: sanitizeURL(result.Parent),
          target: sanitizeURL(child),
          depth: result.Depth,
          targetImageContainer: imgContainer,
          // Convert from nanoseconds to milliseconds
          timeFound: (animationTimeScale * result.TimeFound) / 1000000,
        });
      }
    }
  }, []);

  // Adds results to the graph when they should be added
  const displayCrawlResults = useCallback(() => {
    if (babyLinksRef.current.length === 0) {
      setTimeout(displayCrawlResults, animationPeriod);
      return;
    }

    const lastBabyLinkToDisplay = allBeforeTime(
      babyLinksRef.current,
      Date.now() - startTimeRef.current
    );

    if (lastBabyLinkToDisplay < 0) {
      setTimeout(displayCrawlResults, animationPeriod);
      return;
    }

    let newNodes = [];
    let newLinks = [];
    for (let i = 0; i < lastBabyLinkToDisplay; i++) {
      if (!existingNodesRef.current.has(babyLinksRef.current[i].target)) {
        newNodes.push({
          id: babyLinksRef.current[i].target,
          depth: babyLinksRef.current[i].depth,
          imageContainer: babyLinksRef.current[i].targetImageContainer,
        });
        existingNodesRef.current.add(babyLinksRef.current[i].target);
      }
      existingEdgesRef.current.add(babyLinksRef.current[i]);
      newLinks.push(babyLinksRef.current[i]);
    }
    setGraphData(prevGraphData => ({
      nodes: prevGraphData.nodes.concat(newNodes),
      links: prevGraphData.links.concat(newLinks),
    }));

    babyLinksRef.current = babyLinksRef.current.slice(lastBabyLinkToDisplay);
    setTimeout(displayCrawlResults, animationPeriod);
  }, []);

  const crawlURLCallback = useCallback((url) => {
    startingURLRef.current = sanitizeURL(url);
    startCrawl(startingURLRef.current);
    setSubmitState("VALIDATING");
    setGraphData({
      nodes: [
        {
          id: startingURLRef.current,
          imageContainer: createImageContainerForDomain(
            getDomain(startingURLRef.current)
          ),
        },
      ],
      links: [],
    });
  }, [startCrawl]);

  return (
    <div>
      {submitState === "NOINPUT" && (
        <CrawlForm crawlURLCallback={crawlURLCallback} />
      )}
      {submitState === "VALIDATING" && (
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="flex flex-col items-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <span className="text-gray-600">Loading...</span>
          </div>
        </div>
      )}
      {submitState === "VALIDATED" && (
        <CrawlGraph graphData={graphData} />
      )}
      {submitState === "ERROR" && (
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Warning
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>
                    Web Crawler couldn't find any links at this url, please refresh and
                    try another.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
