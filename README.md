# n8n-nodes-enconvert

An n8n community node for [EnConvert](https://www.enconvert.com). Convert files between formats, scrape
web pages into clean markdown, and crawl whole sites into passages you can embed in a vector store —
all from one node.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/)
workflow automation platform.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) ·
[Supported formats](#supported-formats) · [Example workflows](#example-workflows) ·
[Compatibility](#compatibility) · [Resources](#resources)

## Why this node

n8n's built-in `Extract From File` reads CSV, HTML, JSON, ICS, ODS, PDF text, RTF, TXT, XLS and XLSX.
It does not read Word, PowerPoint or EPUB, it cannot render a web page, and on n8n Cloud you cannot
install the command-line tools that would fill those gaps.

This node covers exactly those gaps:

- **Word, PowerPoint, Excel, EPUB and RTF into markdown** — the formats `Extract From File` skips.
- **Anything into PDF** — documents, spreadsheets, presentations, HTML, markdown, images and SVG.
- **Web pages into markdown** — roughly six times smaller than raw HTML, which cuts the token cost of
  every AI node downstream.
- **Real files, not links** — screenshots and PDFs come back as n8n binary you can attach to an email
  or upload to Drive, with no extra HTTP Request node.
- **Whole sites into embeddable passages** — one node replaces a crawl, chunk, loop and code pipeline.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the
n8n community nodes documentation, using the package name:

```
@enconvert/n8n-nodes-enconvert
```

## Credentials

1. Create an account at [enconvert.com](https://www.enconvert.com).
2. Open [Dashboard → API keys](https://www.enconvert.com/dashboard/api-keys) and create a **private** key.
   It starts with `sk_`.
3. In n8n, add an **EnConvert API** credential and paste the key.
4. Use **Test** to confirm it works. The test calls `GET /v1/whoami`.

Public keys starting with `pk_` are for browser widgets and are rejected by this node.

**Base URL** only needs changing if EnConvert gave you a different endpoint. It defaults to
`https://api.enconvert.com`.

## Operations

### File

| Operation | What it does |
| --- | --- |
| **Convert to PDF** | Turns a document, spreadsheet, presentation, web page, image or text file into a PDF. Page size, orientation, margins, scale, grayscale, header and footer are available for HTML, markdown, text, EPUB, images and SVG. Office files carry their own page setup, so only Grayscale applies to them. |
| **Convert to Markdown** | Turns Word, PowerPoint, Excel, PDF, EPUB, RTF, HTML and text files into markdown. Returns the text in the item by default so it can go straight into an AI node. |
| **Convert Data** | Converts between JSON, CSV, XML, YAML, TOML and HTML. Converting to JSON gives a ready-to-use object under `data`. |
| **Split Into Chunks** | Uploads every input item's file as one job and returns overlapping passages ready to embed. Up to 200 files per run. |

### Image

| Operation | What it does |
| --- | --- |
| **Convert Format** | Converts between JPEG, PNG, WebP, HEIC and SVG, or turns a PDF page into JPEG. Width and Height apply when converting an SVG to a raster format. |
| **Compress** | Shrinks a PNG, JPEG or WebP towards a target size. Best effort: an unreachable target returns the smallest result achieved rather than an error. |

### Web Page

| Operation | What it does |
| --- | --- |
| **Scrape** | Renders one page and returns markdown, cleaned or raw HTML, links, images and structured data in the item, plus screenshots and PDFs as binary. Results are cached for about an hour, and a cache hit is free. |
| **Scrape Many** | Renders up to 1000 pages in one run. Accepts a list typed in the field or an expression returning an array, so it chains directly from **Website → Map**. Use Output Mode `Single ZIP File` with the PDF output to archive a set of pages. |
| **Extract** | Pulls named fields off one or many pages. Describe what you want in plain language, list the fields, or supply a JSON Schema. Optional CSS selectors answer what they can before anything falls through to AI extraction, which lowers cost on pages with a fixed layout. |

### Website

| Operation | What it does |
| --- | --- |
| **Map** | Lists a site's addresses without rendering them. Fast, and it uses none of your page allowance. Feed the result into **Scrape Many** or **Crawl**. |
| **Crawl** | Reads a whole site and returns passages ready to embed, each carrying its source URL, title and heading path. Runs without cookies or sign-in by design. |

### Search

| Operation | What it does |
| --- | --- |
| **Search** | Searches the web, news, images, scholar, patents or maps, returning one item per result. **Scrape Top Results** also renders the top few and attaches their markdown, so you get the results page and the page contents in one run. |

### Job

| Operation | What it does |
| --- | --- |
| **Get** | Looks up any EnConvert job by ID. The right endpoint is chosen from the prefix, so scrape (`per_`), multi-page scrape (`batch_`), crawl (`ing_`) and conversion IDs all work. |
| **Get Many** | Lists recent crawl jobs. |
| **Cancel** | Stops a running crawl or multi-page scrape. |
| **Retry Webhook** | Sends a finished crawl's completion webhook again. |

## Response Format

Every file and image operation offers three ways to return the result:

| Value | Result |
| --- | --- |
| **File** | The converted file is attached to the item as binary. |
| **Text** | The contents go into the item as text. Converting to JSON gives a parsed object under `data`. |
| **URL Only** | Just a download link, with no transfer. |

Use **URL Only** for results above 16 MB: that is n8n's default maximum item size and it is not
adjustable on n8n Cloud. Download links expire after 15 minutes.

## Long-running operations

**Scrape Many**, **Crawl** and **Split Into Chunks** run as jobs. By default the node waits for them
and returns the finished result. Under **Options** you can change **Max Wait Time** (120 seconds by
default) and **Poll Interval**, or turn **Wait for Completion** off to get the job ID immediately.

If the wait runs out, the error contains the job ID — the work is not lost. Collect it later with
**Job → Get**. On n8n Cloud, keep Max Wait Time under 300 seconds, because executions can be cancelled
at that point.

For crawls of several hundred pages, set a **Webhook URL** and turn **Wait for Completion** off. Point
it at an n8n Webhook node and continue there when EnConvert calls back.

## Supported formats

**Convert to PDF** accepts: `bmp` `csv` `doc` `docx` `epub` `gif` `heic` `heif` `htm` `html` `jpeg`
`jpg` `markdown` `md` `mdown` `mkd` `numbers` `odp` `ods` `odt` `ots` `pages` `pdf` `png` `ppt` `pptx`
`rtf` `svg` `text` `tif` `tiff` `txt` `webp` `xhtml` `xls` `xlsx`

**Convert to Markdown** accepts: `csv` `doc` `docx` `epub` `htm` `html` `markdown` `md` `mdown` `mkd`
`odp` `ods` `odt` `pdf` `ppt` `pptx` `rtf` `text` `txt` `xhtml` `xls` `xlsx`

**Convert Data** pairs: JSON to and from XML, YAML, TOML and CSV; CSV to and from XML; markdown to HTML.

**Convert Format** (images): JPEG, PNG, WebP, HEIC and SVG in any combination, plus PDF to JPEG.
Width and Height apply only when converting an SVG to JPEG, PNG or WebP, and the two multiplied
together cannot exceed 25 million.

**Compress** accepts: `png` `jpg` `jpeg` `webp`

If a combination is not supported, the node says so before making any request and lists what the file
can be converted to instead.

Scanned pages with no text layer are not read. There is no OCR in this node.

## Example workflows

### Word document to a summary

```
Google Drive (Download)  →  EnConvert  →  Basic LLM Chain
                            File · Convert to Markdown
                            Response Format: Text
```

The markdown arrives at `{{ $json.text }}`.

### Invoice HTML to a PDF attachment

```
Set (build HTML)  →  Convert to File  →  EnConvert                →  Gmail (Send)
                     (Text to File)      File · Convert to PDF
                                         PDF Options: A4, margins
```

### Website to a vector store

```
EnConvert                                →  Embeddings  →  Pinecone
Website · Crawl
Mode: Sitemap · Max Pages: 200
Output: Chunks
```

Each item carries `content`, `sourceUrl`, `title`, `headingsPath` and `chunkIndex`, so it can go
straight into a vector store node.

### Competitor pricing into a sheet

```
EnConvert          →  EnConvert                              →  Google Sheets
Website · Map         Web Page · Extract
Mode: Sitemap         Source: Specific URLs
                      URLs: {{ $json.url }}
                      Define Fields By: Description
                      "the plan name and monthly price"
```

### Page screenshot into Slack

```
Schedule Trigger  →  EnConvert                     →  Slack (Upload file)
                     Web Page · Scrape
                     Outputs: Screenshot
```

The PNG arrives as binary under `screenshot`, ready to upload with no extra node.

## Using this node with an AI Agent

Every operation is available to the AI Agent node as a tool. The web operations suit agents best,
because an agent can supply a URL or a search query but cannot hand over a file.

Useful tools to expose: **Web Page → Scrape**, **Search → Search**, **Web Page → Extract** and
**Website → Map**.

## Compatibility

Tested against n8n 1.109 and later. Requires Node.js 20 or newer.

## Resources

- [EnConvert documentation](https://www.enconvert.com/docs/introduction)
- [EnConvert API reference](https://www.enconvert.com/docs)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)

## Licence

[MIT](LICENSE.md)
