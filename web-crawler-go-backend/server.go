package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
)

// Allowed origins for CORS. Update as needed.
var allowedOrigins = []string{
	"http://localhost:3000",
	"http://localhost:5173",
	"http://localhost:8080",
	"https://localhost:3000",
	"https://localhost:5173",
	"https://localhost:8080",
}

// HTTP request/response types
type InitializeCrawlRequest struct {
	URL string `json:"url"`
}

type InitializeCrawlResponse struct {
	ResultsURL string `json:"resultsURL"`
}

type LookupCrawlResponse struct {
	Edges []graphNode `json:"edges"`
	Links *Links      `json:"_links,omitempty"`
}

type Links struct {
	Next *NextLink `json:"next,omitempty"`
}

type NextLink struct {
	Href string `json:"href"`
}

type ErrorResponse struct {
	Message string `json:"message"`
}

// Helper function to build results link
func buildResultsLink(host, uniqueID string, startIndex int) string {
	return fmt.Sprintf("http://%s/crawl/%s?startIndex=%d", host, uniqueID, startIndex)
}

// Helper function to send JSON response
func sendJSONResponse(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

// Helper function to send error response
func sendErrorResponse(w http.ResponseWriter, statusCode int, message string) {
	sendJSONResponse(w, statusCode, ErrorResponse{Message: message})
}

// Initialize crawl handler - POST /crawl
func initializeCrawlHandler(w http.ResponseWriter, r *http.Request, rdb *redis.Client) {
	if r.Method != http.MethodPost {
		sendErrorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req InitializeCrawlRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	if req.URL == "" {
		sendErrorResponse(w, http.StatusBadRequest, "URL is required")
		return
	}

	// Generate unique ID
	uniqueID := fmt.Sprintf("%d", time.Now().UnixNano())

	// Publish command to Redis
	command := fmt.Sprintf("%s,%s", req.URL, uniqueID)
	if err := rdb.Publish(ctx, "go-crawler-commands", command).Err(); err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "Failed to publish command")
		return
	}

	// Build results URL
	host := r.Host
	resultsURL := buildResultsLink(host, uniqueID, 0)

	response := InitializeCrawlResponse{ResultsURL: resultsURL}
	sendJSONResponse(w, http.StatusAccepted, response)
}

// Lookup crawl handler - GET /crawl/{crawl_ID}
func lookupCrawlHandler(w http.ResponseWriter, r *http.Request, rdb *redis.Client) {
	if r.Method != http.MethodGet {
		sendErrorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	vars := mux.Vars(r)
	crawlID := vars["crawl_ID"]
	if crawlID == "" {
		sendErrorResponse(w, http.StatusBadRequest, "Crawl ID is required")
		return
	}

	// Get start index from query parameters
	startIndexStr := r.URL.Query().Get("startIndex")
	if startIndexStr == "" {
		sendErrorResponse(w, http.StatusBadRequest, "Must specify starting index")
		return
	}

	startIndex, err := strconv.Atoi(startIndexStr)
	if err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "Invalid data type in query params")
		return
	}

	// Get results from Redis
	resultsListKey := fmt.Sprintf("go-crawler-results-%s", crawlID)
	listLen, err := rdb.LLen(ctx, resultsListKey).Result()
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "Failed to get results length")
		return
	}

	// Get results from start index to end
	rawResults, err := rdb.LRange(ctx, resultsListKey, int64(startIndex), listLen-1).Result()
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "Failed to get results")
		return
	}

	// No new results found
	if len(rawResults) == 0 {
		host := r.Host
		nextLink := buildResultsLink(host, crawlID, startIndex)
		response := LookupCrawlResponse{
			Edges: []graphNode{},
			Links: &Links{
				Next: &NextLink{Href: nextLink},
			},
		}
		sendJSONResponse(w, http.StatusOK, response)
		return
	}

	// Parse results
	results := make([]graphNode, 0, len(rawResults))
	for _, rawResult := range rawResults {
		var node graphNode
		if err := json.Unmarshal([]byte(rawResult), &node); err != nil {
			// Check if it's a finish sentinel
			var sentinel finishSentinel
			if err := json.Unmarshal([]byte(rawResult), &sentinel); err == nil && sentinel.DoneMessage != "" {
				// This is the finish sentinel, return results without it
				break
			}
			continue
		}
		results = append(results, node)
	}

	// Check if the last result was a finish sentinel (crawl completed)
	lastResult := rawResults[len(rawResults)-1]
	var sentinel finishSentinel
	if json.Unmarshal([]byte(lastResult), &sentinel) == nil && sentinel.DoneMessage != "" {
		// Crawl is complete, return results without next link
		response := LookupCrawlResponse{Edges: results}
		sendJSONResponse(w, http.StatusOK, response)
		return
	}

	// Crawl is still in progress, return results with next link
	host := r.Host
	nextIndex := startIndex + len(results)
	nextLink := buildResultsLink(host, crawlID, nextIndex)
	response := LookupCrawlResponse{
		Edges: results,
		Links: &Links{
			Next: &NextLink{Href: nextLink},
		},
	}
	sendJSONResponse(w, http.StatusOK, response)
}

// StartHTTPServer starts the HTTP server with the given Redis client
func StartHTTPServer(rdb *redis.Client) {
	// Set up HTTP server with Gorilla Mux
	router := mux.NewRouter()

	// Create handlers that have access to the Redis client
	initializeHandler := func(w http.ResponseWriter, r *http.Request) {
		initializeCrawlHandler(w, r, rdb)
	}
	lookupHandler := func(w http.ResponseWriter, r *http.Request) {
		lookupCrawlHandler(w, r, rdb)
	}

	// Define routes
	router.HandleFunc("/crawl", initializeHandler).Methods("POST")
	router.HandleFunc("/crawl/{crawl_ID}", lookupHandler).Methods("GET")
	// Explicit OPTIONS routes (useful for some proxies/CDNs)
	router.HandleFunc("/crawl", func(w http.ResponseWriter, r *http.Request) {}).Methods("OPTIONS")
	router.HandleFunc("/crawl/{crawl_ID}", func(w http.ResponseWriter, r *http.Request) {}).Methods("OPTIONS")

	// Wrap with CORS middleware
	cors := handlers.CORS(
		handlers.AllowedOrigins(allowedOrigins),
		handlers.AllowedMethods([]string{"GET", "POST", "OPTIONS"}),
		handlers.AllowedHeaders([]string{"Content-Type", "Authorization"}),
		handlers.AllowCredentials(),
	)

	// Start HTTP server
	fmt.Println("Starting HTTP server on :8080")
	if err := http.ListenAndServe(":8080", cors(router)); err != nil {
		fmt.Printf("HTTP server error: %v\n", err)
	}
}
