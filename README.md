# elorus-mcp

MCP server for the [Elorus](https://www.elorus.com/) invoicing and accounting platform. Enables AI assistants to create invoices, manage contacts, and query financial data through natural language.

## Setup

### Prerequisites

- Node.js 20+
- An Elorus account with an API key and organization ID

### Getting your credentials

1. **API key** — open the Elorus web app → User Profile → API key
2. **Organization ID** — open the Elorus web app → Settings → Organization → Organization ID

### Install

```bash
npx elorus-mcp
```

Or clone and build locally:

```bash
git clone https://github.com/your-org/elorus-mcp
cd elorus-mcp
npm install && npm run build
```

## Claude Desktop configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "elorus": {
      "command": "npx",
      "args": ["elorus-mcp"],
      "env": {
        "ELORUS_API_KEY": "your-api-key",
        "ELORUS_ORG_ID": "your-org-id"
      }
    }
  }
}
```

## Claude Code configuration

```bash
claude mcp add elorus -e ELORUS_API_KEY=your-api-key -e ELORUS_ORG_ID=your-org-id -- npx elorus-mcp
```

## Available tools (Phase 1)

### Contacts
| Tool | Description |
|---|---|
| `list_contacts` | Search/filter contacts with pagination |
| `get_contact` | Fetch a contact by ID |
| `create_contact` | Create a client, supplier, or both |

### Invoices
| Tool | Description |
|---|---|
| `list_invoices` | Filter invoices by status, client, date range |
| `get_invoice` | Fetch an invoice by ID |
| `create_invoice` | Create a sales invoice with line items and taxes |

### Products
| Tool | Description |
|---|---|
| `list_products` | Search the products/services catalog |
| `get_product` | Fetch a product by ID |
| `create_product` | Add a product or service to the catalog |

## Example prompts

- *"Create an invoice for Acme Corp for 5 hours of consulting at €150/hour with 24% VAT"*
- *"What invoices are overdue this month?"*
- *"Look up the contact for Elorus FC and show their details"*
- *"Add a new product called 'Website Design' at €800 with standard VAT"*

## Notes

- All monetary values are strings (e.g. `"1500.00"`) to avoid floating-point precision issues
- Use `list_taxes` and `list_document_types` (Phase 2) to look up valid IDs for invoice creation
- Elorus does not provide idempotency keys — query before creating to avoid duplicates
- Pagination params: `page` (default 1) and `page_size` (default 20, max 100)
