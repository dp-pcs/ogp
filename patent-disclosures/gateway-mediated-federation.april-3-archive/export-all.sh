#!/bin/bash
set -euo pipefail

# Patent Disclosure Export Script
# Converts all markdown files to various formats for easy sharing

OUTPUT_DIR="exports"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "=== Patent Disclosure Export ==="
echo "Output directory: $OUTPUT_DIR"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Function to convert markdown to docx
convert_to_docx() {
    local input="$1"
    local output="$2"
    local title="$3"

    pandoc "$input" \
        -o "$output" \
        --from markdown \
        --to docx \
        --metadata title="$title" \
        --metadata author="David Proctor" \
        --metadata date="$(date +%Y-%m-%d)" \
        --highlight-style tango \
        --toc \
        --toc-depth=3

    echo "✓ Exported: $output"
}

# Function to convert markdown to PDF
convert_to_pdf() {
    local input="$1"
    local output="$2"
    local title="$3"

    pandoc "$input" \
        -o "$output" \
        --from markdown \
        --to pdf \
        --pdf-engine=xelatex \
        --metadata title="$title" \
        --metadata author="David Proctor" \
        --metadata date="$(date +%Y-%m-%d)" \
        --highlight-style tango \
        --toc \
        --toc-depth=3 \
        -V geometry:margin=1in \
        -V fontsize=11pt

    echo "✓ Exported: $output"
}

# Function to create combined document
create_combined_markdown() {
    local output="$OUTPUT_DIR/COMPLETE-DISCLOSURE.md"

    cat > "$output" << 'EOF'
# Gateway-Mediated Agent Federation with Containment Preservation

**Complete Patent Disclosure**

**Inventor:** David Proctor
**Date:** March 2026
**Status:** Complete

---

EOF

    # Add README summary
    echo "## Document Overview" >> "$output"
    echo "" >> "$output"
    tail -n +3 README.md >> "$output"
    echo -e "\n---\n" >> "$output"

    # Add all sections
    echo "## Executive Summary" >> "$output"
    echo "" >> "$output"
    echo "(See ids.json for Executive Summary, Novelty, and Introduction sections)" >> "$output"
    echo -e "\n---\n" >> "$output"

    echo "## Context / Environment" >> "$output"
    tail -n +3 context.md >> "$output"
    echo -e "\n---\n" >> "$output"

    echo "## Problems Solved" >> "$output"
    tail -n +3 problems-solved.md >> "$output"
    echo -e "\n---\n" >> "$output"

    echo "## How It Works" >> "$output"
    tail -n +3 how-it-works-CORRECTED.md >> "$output"
    echo -e "\n---\n" >> "$output"

    echo "## Case Studies" >> "$output"
    tail -n +3 case-studies.md >> "$output"
    echo -e "\n---\n" >> "$output"

    echo "## Pseudocode" >> "$output"
    tail -n +3 pseudocode.md >> "$output"
    echo -e "\n---\n" >> "$output"

    echo "## Data Structures" >> "$output"
    tail -n +3 data-structures.md >> "$output"
    echo -e "\n---\n" >> "$output"

    echo "## Implementation Details" >> "$output"
    tail -n +3 implementation-details.md >> "$output"
    echo -e "\n---\n" >> "$output"

    echo "## Alternatives & Comparison" >> "$output"
    tail -n +3 alternatives-comparison.md >> "$output"
    echo -e "\n---\n" >> "$output"

    echo "## Prior Art" >> "$output"
    tail -n +3 prior-art.md >> "$output"
    echo -e "\n---\n" >> "$output"

    echo "## Draft Patent Claims" >> "$output"
    tail -n +3 claims.md >> "$output"
    echo -e "\n---\n" >> "$output"

    echo "## Appendix: Executive Summary Deck" >> "$output"
    tail -n +3 executive-summary-deck.md >> "$output"
    echo -e "\n---\n" >> "$output"

    echo "## Appendix: Technical Blog Post" >> "$output"
    tail -n +3 blog-post-draft.md >> "$output"

    echo "✓ Created: $output"
}

echo "Step 1: Creating combined disclosure document..."
create_combined_markdown

echo ""
echo "Step 2: Converting to DOCX (Google Docs compatible)..."

# Convert individual sections to DOCX
convert_to_docx "README.md" "$OUTPUT_DIR/01-README.docx" "Patent Disclosure Overview"
convert_to_docx "context.md" "$OUTPUT_DIR/02-Context.docx" "Context and Environment"
convert_to_docx "problems-solved.md" "$OUTPUT_DIR/03-Problems-Solved.docx" "Problems Solved"
convert_to_docx "how-it-works-CORRECTED.md" "$OUTPUT_DIR/04-How-It-Works.docx" "How It Works"
convert_to_docx "case-studies.md" "$OUTPUT_DIR/05-Case-Studies.docx" "Case Studies"
convert_to_docx "pseudocode.md" "$OUTPUT_DIR/06-Pseudocode.docx" "Algorithms and Pseudocode"
convert_to_docx "data-structures.md" "$OUTPUT_DIR/07-Data-Structures.docx" "Data Structures"
convert_to_docx "implementation-details.md" "$OUTPUT_DIR/08-Implementation-Details.docx" "Implementation Details"
convert_to_docx "alternatives-comparison.md" "$OUTPUT_DIR/09-Alternatives-Comparison.docx" "Alternatives and Comparison"
convert_to_docx "prior-art.md" "$OUTPUT_DIR/10-Prior-Art.docx" "Prior Art Analysis"
convert_to_docx "claims.md" "$OUTPUT_DIR/11-Patent-Claims.docx" "Draft Patent Claims"
convert_to_docx "executive-summary-deck.md" "$OUTPUT_DIR/12-Executive-Summary-Deck.docx" "Executive Summary Deck"
convert_to_docx "blog-post-draft.md" "$OUTPUT_DIR/13-Blog-Post-Draft.docx" "Technical Blog Post"

# Convert combined document
convert_to_docx "$OUTPUT_DIR/COMPLETE-DISCLOSURE.md" "$OUTPUT_DIR/COMPLETE-DISCLOSURE.docx" "Gateway-Mediated Agent Federation - Complete Patent Disclosure"

echo ""
echo "Step 3: Converting to PDF..."

# Convert key documents to PDF
if command -v xelatex &> /dev/null; then
    convert_to_pdf "$OUTPUT_DIR/COMPLETE-DISCLOSURE.md" "$OUTPUT_DIR/COMPLETE-DISCLOSURE.pdf" "Gateway-Mediated Agent Federation - Complete Patent Disclosure"
    convert_to_pdf "executive-summary-deck.md" "$OUTPUT_DIR/Executive-Summary-Deck.pdf" "Executive Summary Deck"
    convert_to_pdf "claims.md" "$OUTPUT_DIR/Patent-Claims.pdf" "Draft Patent Claims"
else
    echo "⚠ xelatex not found, skipping PDF conversion"
    echo "  Install via: brew install --cask mactex"
fi

echo ""
echo "Step 4: Copying diagram..."
if [ -f "diagrams/data-structures-er-diagram.png" ]; then
    cp diagrams/data-structures-er-diagram.png "$OUTPUT_DIR/"
    echo "✓ Copied: data-structures-er-diagram.png"
fi

echo ""
echo "=== Export Complete ==="
echo ""
echo "Output files in: $OUTPUT_DIR/"
echo ""
echo "DOCX files (Google Docs compatible):"
ls -lh "$OUTPUT_DIR"/*.docx
echo ""

if ls "$OUTPUT_DIR"/*.pdf &> /dev/null; then
    echo "PDF files:"
    ls -lh "$OUTPUT_DIR"/*.pdf
    echo ""
fi

echo "Upload DOCX files to Google Drive to open in Google Docs"
echo ""
echo "Next steps:"
echo "1. Review COMPLETE-DISCLOSURE.docx"
echo "2. Share with patent attorney"
echo "3. Upload to Google Drive if needed"
echo ""
