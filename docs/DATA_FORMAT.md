# Data format

## Master list (CSV or Excel import)

The importer expects a table with at least two columns. A header row is
detected automatically; if there is no header, the **first column is treated as
the number and the second as the status**.

| Column   | Required | Accepted header names                          | Notes |
|----------|----------|------------------------------------------------|-------|
| `number` | yes      | `number`, `no`, `num`, `sticker`, `id`, `code`, `#` | The sticker label. Can be plain digits (`12`) or a code (`ARG3`, `FWC12`). |
| `status` | optional | `status`, `state`, `have`, `type`, `owned`     | One of Owned / Missing / Duplicate. Defaults to **Missing** if blank/unknown. |

### Status values (case-insensitive, with synonyms)

| Canonical   | Also accepted                                   |
|-------------|-------------------------------------------------|
| `Owned`     | own, have, got, yes, y, o                        |
| `Missing`   | miss, need, want, no, n, m                        |
| `Duplicate` | dup, dupe, double, swap, spare, d                 |

### Example CSV

```csv
number,status
1,Owned
3,Missing
4,Duplicate
ARG3,Duplicate
100,Missing
```

An example file lives at [`sample-data/sample-master-list.csv`](../sample-data/sample-master-list.csv).

## Number normalisation (matching rules)

For comparison, a number is normalised by trimming, upper-casing and collapsing
internal whitespace. So `arg 3`, `ARG3` and `Arg  3` all match the same
sticker. The original text you typed/imported is preserved for display.

## Other collector's lists

- **Their duplicates** come from the **Scan** tab (OCR of a photo) — the
  numbers they can *give* you.
- **Their wanted list** is entered on the **Trade** tab as free text
  (`12, 45, 200 ARG3`) or imported from a CSV / Excel / `.txt` file. These are
  the numbers they are *missing*.

## Storage

Everything is stored in your browser's `localStorage` under the key
`wcsm.collection.v1`. Nothing is uploaded to any server. Clearing your browser
data (or using the **Clear all** button) removes it. Use **Export CSV** to keep
a backup.
