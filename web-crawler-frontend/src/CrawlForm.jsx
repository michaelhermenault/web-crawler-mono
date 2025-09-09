import React, { useState } from "react";

const CrawlForm = ({ crawlURLCallback }) => {
  const [formText, setFormText] = useState("");

  const handleSubmit = (event) => {
    crawlURLCallback(formText);
    event.preventDefault();
  };

  return (
    <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="text"
            placeholder="ex. wikipedia.org"
            autoFocus
            value={formText}
            onChange={(e) => setFormText(e.target.value)}
            className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <button
          type="submit"
          className="w-full px-4 py-3 text-lg font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors cursor-pointer"
        >
          Crawl!
        </button>
      </form>
    </div>
  );
};

export { CrawlForm };
