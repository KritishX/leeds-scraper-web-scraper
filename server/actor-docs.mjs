// Documentation follows the fields produced by this implementation, not the reference's promises.
const docs = {
  "website-content": [
    "Supply public page URLs to collect their text; raise Maximum pages to follow links on the same site.",
    {
      title: "Page title.",
      text: "Visible body text, limited to 100,000 characters per page.",
    },
    [
      "No browser JavaScript execution; content loaded only by scripts may be absent.",
    ],
  ],
  "page-markdown": [
    "Turn public page content into Markdown for notes, research or downstream AI tools.",
    {
      title: "Page title.",
      markdown: "Extracted Markdown content.",
      wordCount: "Whitespace-separated word count.",
    },
    ["HTML conversion cannot recover content that the server did not return."],
  ],
  "contact-extractor": [
    "Find contact information stated in public page markup and structured data.",
    {
      title: "Page title.",
      emails: "Published email addresses.",
      phones: "Published phone strings.",
      socialLinks: "Public social profile URLs.",
      contactPages: "Discovered contact page URLs.",
    },
    [
      "A published contact is not independently verified or checked for reachability.",
    ],
  ],
  "local-business-leads": [
    "Choose a business category and an area. Data comes from OpenStreetMap; optional website visits can add published email addresses.",
    {
      name: "Business name.",
      category: "Selected category.",
      phone: "Published OSM phone string.",
      website: "Published website.",
      email: "Published OSM email.",
      address: "Published address components.",
      city: "Published city.",
      postcode: "Published postcode.",
      country: "Published country.",
      openingHours: "Published opening hours.",
      latitude: "Latitude if present.",
      longitude: "Longitude if present.",
      attribution: "OpenStreetMap source attribution.",
      emails: "Optional website-enrichment emails.",
      socialLinks: "Optional website-enrichment social URLs.",
    },
    [
      "OpenStreetMap coverage varies. This is not Google Maps data.",
      "Website enrichment visits at most 15 listed business websites.",
    ],
  ],
  "website-links": [
    "Map links returned in public HTML pages. Additional crawl pages stay on the same site.",
    {
      title: "Page title.",
      linkCount: "Number of discovered links.",
      links: "Resolved public page links.",
    },
    ["Script-generated links may not appear in returned HTML."],
  ],
  "metadata-extractor": [
    "Inspect page-level search and social metadata from returned HTML.",
    {
      title: "Page title.",
      description: "Meta description.",
      canonical: "Canonical URL.",
      language: "HTML language.",
      robots: "Robots meta directive.",
      h1: "First main heading.",
      icon: "Page icon URL.",
      openGraph: "Open Graph properties.",
      twitter: "Twitter Card properties.",
    },
    ["Metadata is publisher-supplied and may be missing or stale."],
  ],
  "structured-data": [
    "Read JSON-LD, microdata and social metadata from public pages.",
    {
      syntax: "Structured-data syntax.",
      type: "Declared entity type.",
      name: "Entity name if published.",
      data: "Published entity data.",
    },
    [
      "Entities over 100,000 serialized characters are represented by an explicit truncated marker.",
    ],
  ],
  "product-data": [
    "Read product markup from shop pages that publish JSON-LD, microdata or Open Graph product data.",
    {
      source: "Markup source.",
      name: "Product name.",
      brand: "Brand.",
      sku: "SKU.",
      mpn: "Manufacturer part number.",
      gtin: "Published GTIN.",
      price: "Published price.",
      priceCurrency: "Currency.",
      lowPrice: "Lowest stated price.",
      highPrice: "Highest stated price.",
      availability: "Published availability.",
      condition: "Published condition.",
      seller: "Seller name.",
      offerCount: "Offer count.",
      ratingValue: "Published rating.",
      reviewCount: "Published review count.",
      description: "Product description.",
      images: "Published image URLs.",
      url: "Product URL.",
    },
    [
      "Missing prices or stock values stay unknown; this does not purchase or reserve items.",
    ],
  ],
  "table-extractor": [
    "Convert HTML table rows into structured records using the table headers.",
    {
      tableIndex: "Source table index.",
      caption: "Table caption.",
      "Header columns": "Additional fields use the source table headers.",
    },
    ["Only HTML tables are read; image-based tables are unsupported."],
  ],
  "custom-selectors": [
    "Define one field per line using CSS selectors; optionally select a repeating item container.",
    {
      "Configured fields":
        "Keys come from your selector specification; [] fields contain arrays.",
    },
    [
      "Selectors must match the returned HTML; this does not execute page scripts.",
    ],
  ],
  "feed-reader": [
    "Read public RSS, Atom, RDF feeds or XML sitemaps. Raise Maximum files to follow a sitemap index.",
    {
      kind: "Feed item, sitemap or sitemap URL.",
      title: "Feed item title.",
      link: "Item link.",
      feedTitle: "Feed title.",
      published: "Published date.",
      updated: "Updated date.",
      author: "Published author.",
      summary: "Item summary.",
      categories: "Item categories.",
      loc: "Sitemap URL.",
      lastmod: "Sitemap modification date.",
      changefreq: "Sitemap frequency hint.",
      priority: "Sitemap priority hint.",
    },
    [
      "Fields depend on the document type. These are publisher declarations, not freshness guarantees.",
    ],
  ],
  "social-embeds": [
    "Read known public post URLs through supported providers’ official oEmbed endpoints.",
    {
      provider: "oEmbed provider.",
      type: "Embed type.",
      title: "Published title.",
      authorName: "Published author.",
      authorUrl: "Author URL.",
      thumbnailUrl: "Thumbnail URL.",
      thumbnailWidth: "Thumbnail width.",
      thumbnailHeight: "Thumbnail height.",
      providerUrl: "Provider website.",
      embedHtml: "Returned embed markup, stored as text.",
    },
    [
      "Metadata only; does not discover posts, download videos or recover hidden engagement statistics.",
    ],
  ],
  "ai-extract": [
    "Describe the fields to extract. The configured model receives page Markdown and returns JSON.",
    {
      title: "Source title.",
      model: "Configured model identifier.",
      contentTruncated: "Whether the model input hit its character limit.",
      data: "Parsed model output.",
      parseError: "JSON parsing failure when applicable.",
      rawReply: "Bounded raw model reply on parsing failure.",
    },
    [
      "Requires a configured OpenAI-compatible model. Page content is sent to that endpoint.",
      "Model output can be inaccurate; review against the source.",
    ],
  ],
};
const platformOutput = {
  platform: "Source platform.",
  extractionMode:
    "Embedded structured data or explicit public metadata fallback.",
  id: "Published platform identifier.",
  name: "Published display name.",
  username: "Published username.",
  description: "Published caption, profile description or post text.",
  imageUrl: "Published image URL.",
  videoUrl: "Published media URL if exposed.",
  publishedAt: "Published timestamp.",
  followers: "Published follower count if exposed.",
  likes: "Published like count if exposed.",
  comments: "Published comment count if exposed.",
  shares: "Published share count if exposed.",
  views: "Published view count if exposed.",
};
for (const id of [
  "tiktok-scraper",
  "instagram-scraper",
  "instagram-profile",
  "instagram-reel",
  "facebook-search-posts",
  "tiktok-search",
])
  docs[id] = [
    "Read only the data exposed in public platform pages. Search tools request the public web search page for your query.",
    platformOutput,
    [
      "Direct HTML collection is independent of Apify. There is no login, private API or protection bypass.",
      "Robots restrictions, unavailable page data and login challenges produce real failures. Full Apify feature parity is not implemented.",
      "Fields vary by published page data; metadata fallback does not establish engagement or follower counts.",
    ],
  ];
docs["google-maps-scraper"] = [
  "Search for businesses using an enabled Google Places API project.",
  {
    placeId: "Google place identifier.",
    name: "Published place name.",
    address: "Formatted address.",
    phone: "Published phone when returned.",
    website: "Published website when returned.",
    latitude: "Place latitude.",
    longitude: "Place longitude.",
    businessStatus: "Published operating status.",
    rating: "Published rating.",
    ratingCount: "Published rating count.",
    openingHours: "Published weekday opening hours.",
    attributions: "Upstream provider attribution.",
  },
  [
    "A configured Google API key and billing are required.",
    "Data availability, review limits and pricing follow Google’s API, not Apify.",
  ],
];
docs["google-search-scraper"] = [
  "Search using an eligible existing Google Custom Search JSON API project.",
  {
    title: "Result title.",
    snippet: "Result description.",
    displayLink: "Displayed domain.",
    rank: "Position in the upstream results.",
  },
  [
    "Requires a configured API key and search engine ID.",
    "Google closed this API to new customers and plans to end service on January 1, 2027.",
    "No ads, AI overviews, AI Mode or People Also Ask extraction.",
  ],
];
docs["youtube-scraper"] = [
  "Enter public video URLs, or use a query with a configured YouTube Data API key.",
  {
    videoId: "Video identifier.",
    title: "Video title.",
    channelName: "Published channel name.",
    channelUrl: "Public channel URL.",
    thumbnailUrl: "Thumbnail URL.",
    description: "Video description when the Data API is used.",
    publishedAt: "Published timestamp with the Data API.",
    channelId: "Channel identifier with the Data API.",
    duration: "Published duration with the Data API.",
    views: "View count when available.",
    likes: "Like count when available.",
    comments: "Comment count when available.",
    subscriberCount: "Visible channel subscriber count with the Data API.",
    channelVideoCount: "Channel video count with the Data API.",
  },
  [
    "Known video URLs can use oEmbed without a key. Search and additional statistics require a YouTube Data API key.",
    "No video downloads or quota bypass.",
  ],
];

export function actorDocumentation(actor) {
  const [overview, output, limitations] = docs[actor.id] ?? [
    actor.description,
    {},
    [],
  ];
  return {
    overview,
    output: Object.entries({
      sourceUrl: "Source URL for this record.",
      collectedAt: "Collection timestamp in ISO 8601 format.",
      ...output,
    }).map(([name, description]) => ({ name, description })),
    limitations,
  };
}
