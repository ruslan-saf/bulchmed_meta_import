---
name: pdf-meta-extractor
description: Extracts structured metadata from academic journal PDF articles using LLM-based analysis. Outputs JSON matching the OJS import format with trilingual fields (Russian, Kazakh, English). Use when processing academic PDFs for journal submission metadata.
---

# PDF Metadata Extractor

Extracts structured metadata from academic journal PDF articles using LLM-based analysis and outputs JSON matching the OJS import format.

## When to Use

- User provides a PDF file of an academic article
- User asks to extract metadata, authors, abstract, or keywords from a PDF
- User wants to populate article metadata for journal submission to the Bulletin of L.N. Gumilyov ENU

## Workflow

### Step 1: Extract Raw Text from PDF

Use `pdfplumber` to extract text from the first 3-5 pages, the pages before references (Author Information section), AND the last 2-3 pages. This is the ONLY script step - all extraction logic is LLM-based.

```bash
python -c "import sys; sys.stdout.reconfigure(encoding='utf-8'); import pdfplumber; pdf = pdfplumber.open('<pdf-path>'); n=len(pdf.pages); [print(f'=== PAGE {i+1} ===\n{page.extract_text()}') for i in sorted(set(range(min(5,n))) | set(range(max(0,n-3),n)) | set(range(max(0,n-6),max(0,n-3)))); page=pdf.pages[i]]; pdf.close()"
```

- **First pages (1-5):** Primary article metadata (title, authors, abstract, keywords in the article's main language)
- **Pre-references pages (N-6 to N-3):** "Author Information" section with ORCID IDs, full affiliations, and author contributions
- **Last pages (N-2 to N):** Translated metadata blocks — titles, abstracts, and keywords in the other two languages (Russian, Kazakh, English)

Save the extracted text for analysis.

### Step 2: Analyze and Extract Metadata via LLM

Analyze the extracted text and produce the JSON output. Follow these extraction rules:

**Title:** Find the article title on the first page. It appears after the article type marker (Article/Обзор/Шолу/Научная статья/Ғылыми мақала) and before the author names.

**Authors:** Identify all author names. They appear as a comma-separated list before the numbered affiliations. Split each author into `first_name` and `last_name`.

**Affiliations:** The numbered blocks (1, 2, 3...) contain university names, city, country. Map each author to their affiliation by the superscript numbers next to their name.

**Emails:** Extract all email addresses from the affiliation block. Map them to authors in order of appearance.

**ORCID:** Look in the "Author Information" / "Информация об авторах" / "Авторлар туралы ақпарат" section, typically located just before the References section. Each author entry includes an ORCID URL (e.g., `https://orcid.org/0000-0000-0000-0000`). Extract the ORCID ID and map it to the correct author by matching the name.

**Abstract:** Text following "Abstract:", "Аннотация:", or "Аңдатпа:" up to the Keywords section or Citation block.

**Keywords:** Text following "Keywords:", "Ключевые слова:", or "Кілт сөздер:". Split by semicolons or commas. Exclude dates, copyright notices, license URLs, and editorial metadata.

**Language detection:** Determine the primary language by the abstract marker:
- "Abstract:" → English
- "Аннотация:" → Russian
- "Аңдатпа:" → Kazakh

### Step 3: Extract All Three Language Variants

Articles in this journal contain metadata in all three languages. Extract each variant from the PDF:

**Primary language (first page):** The main title, abstract, keywords, and authors are on the first page in the article's primary language.

**Translated variants (last pages):** At the end of the article (typically the last 2-3 pages), there are dedicated blocks with:
- Title in all three languages (Russian, Kazakh, English)
- Abstract in all three languages
- Keywords in all three languages

Look for section headers like:
- "Название на русском:" / "Орысша атауы:" / "Title in English:"
- "Аннотация на русском:" / "Орысша аңдатпа:" / "Abstract in English:"
- "Ключевые слова:" / "Кілт сөздер:" / "Keywords:"

**Authors:** The journal provides author blocks in three language variants:
- `authors_en` - English transliteration of names
- `authors_ru` - Russian/Cyrillic variant
- `authors_kk` - Kazakh/Cyrillic variant

If the PDF only contains one language variant of authors, use it for all three author arrays. Do NOT translate or transliterate - use what is present in the PDF.

### Step 4: Output JSON

Produce the final JSON with this exact structure:

```json
{
  "article_title_rus": "...",
  "article_title_kaz": "...",
  "article_title_eng": "...",
  "abstract_rus": "...",
  "abstract_kaz": "...",
  "abstract_eng": "...",
  "keywords_rus": ["...", "..."],
  "keywords_kaz": ["...", "..."],
  "keywords_eng": ["...", "..."],
  "authors_ru": [
    {
      "first_name": "...",
      "last_name": "...",
      "country": "...",
      "orcid": "...",
      "email": "...",
      "university": "..."
    }
  ],
  "authors_kk": [
    {
      "first_name": "...",
      "last_name": "...",
      "country": "...",
      "orcid": "...",
      "email": "...",
      "university": "..."
    }
  ],
  "authors_en": [
    {
      "first_name": "...",
      "last_name": "...",
      "country": "...",
      "orcid": "...",
      "email": "...",
      "university": "..."
    }
  ]
}
```

### Step 5: Validate and Report Issues

After extraction, perform two checks before saving:

**5a. Check for duplicate ORCIDs:**
Collect all ORCID values across all three author arrays (`authors_ru`, `authors_kk`, `authors_en`). If any ORCID appears more than once, flag it as a duplicate. Report which authors share the same ORCID:

```
⚠ WARNING: Duplicate ORCID detected:
  - 0000-0002-7148-7253 assigned to both "Janar Jenis" and "Aizhamal Baiseitova"
```

**5b. Check for missing fields:**
Check for any empty or missing fields. Print a warning summary:

```
⚠ WARNING: Missing fields detected:
  - article_title_kaz: not found in PDF
  - abstract_kaz: not found in PDF
  - authors_kk: not found in PDF
```

List every field that is empty or incomplete. This alerts the user that manual input may be required.

### Step 6: Save to File

Save the JSON file next to the PDF with the suffix `_meta.json`.

## PDF Structure Reference

Articles from the Bulletin of L.N. Gumilyov ENU follow this layout on the first page:

```
IRSTI/МРНТИ/ХҒТАР <code>
<Subject: Chemistry/Geography/Химия/География>
<Article type: Article/Обзор/Шолу/Научная статья>
<Article Title - may span multiple lines>
Author1, Author2, Author3...
1Affiliation with emails
2Affiliation with emails
*Correspondence: email
Abstract:/Аннотация:/Аңдатпа: <text>
Citation:/Цитирование:/Дәйексөз: <citation info>
Keywords:/Ключевые слова:/Кілт сөздер: <keywords>
Received/Revised/Accepted/Published dates
Copyright notice
1. Introduction/Введение/Кіріспе
```

The sidebar (left column) contains citation metadata, dates, and copyright info. The main column contains the article content.

## Key Extraction Guidelines

1. **Keywords cleanup:** Do NOT include dates (e.g., "09.02.2026"), copyright text, license URLs, "CC BY", "Creative Commons", "Submitted for publication", "Academic Editor", or any editorial metadata as keywords.

2. **Author name splitting:** The first word is the first name, remaining words form the last name. Example: "Ulpan Amzeyeva" → first_name: "Ulpan", last_name: "Amzeyeva". For multi-word last names like "Лязат Толымбекова" → first_name: "Лязат", last_name: "Толымбекова".

3. **Affiliation extraction:** Take only the university/institution name, city, and country. Do NOT include email addresses in the university field.

4. **Abstract completeness:** The abstract may be truncated in the first page text extraction. If it appears cut off, extract text from page 2 as well to get the complete abstract.

5. **Country field:** Extract from the affiliation text. Common values: "Казахстан"/"Қазақстан"/"Kazakhstan", "Россия"/"Ресей"/"Russia", "China"/"Китай"/"Қытай", "Malaysia"/"Малайзия", "UK"/"Великобритания"/"Ұлыбритания".

## Batch Processing

For multiple PDFs, repeat Steps 1-5 for each file. Save each result as `<filename>_meta.json` in the same directory as the source PDF.

## Dependencies

- `pdfplumber` for text extraction: `pip install pdfplumber`
