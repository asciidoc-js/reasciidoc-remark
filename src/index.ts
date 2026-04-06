import type {Node as UnistNode, Position} from 'unist'
import type {Processor} from 'unified'
import type * as Ascii from '@asciidoc-js/adast'
import type * as Mdast from 'mdast'
import type {VFile} from 'vfile'
// ---------------------------------------------------------------------------
// Public options
// ---------------------------------------------------------------------------

export interface Options {
  /** Custom handlers keyed by adast node type. */
  handlers?: Partial<Record<string, AsciiHandler>>
  /** Handler for unknown node types. */
  unknownHandler?: AsciiHandler
}

/** Handler signature: receives state, adast node, and its parent. */
export type AsciiHandler = (
  state: ToMdastState,
  node: Ascii.AsciiContent | Ascii.Document,
  parent: Ascii.AsciiContent | Ascii.Document | undefined
) => Mdast.RootContent | Mdast.RootContent[] | undefined

// ---------------------------------------------------------------------------
// State object – passed to every handler
// ---------------------------------------------------------------------------

export interface ToMdastState {
  one(node: Ascii.AsciiContent | Ascii.Document, parent?: Ascii.AsciiContent | Ascii.Document): Mdast.RootContent | undefined
  all(parent: {children: (Ascii.AsciiContent | Ascii.Document)[]}): Mdast.RootContent[]
  toMdastPhrasing(parent: {children: Ascii.InlineContent[]}): Mdast.PhrasingContent[]
  patch(from: UnistNode, to: UnistNode): void
  footnotes: Map<string, Ascii.Footnote>
  footnoteOrder: string[]
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default function reasciidocRemark(destination?: Options | Processor | null, options?: Options | null) {
  if (destination && 'run' in destination) {
    return async function (tree: Ascii.Document, file: VFile) {
      const mdastTree = toMdast(tree, {...options})
      await destination.run(mdastTree, file)
    }
  }
  return function (tree: Ascii.Document) {
    return /** @type {MdastRoot} */ (
      toMdast(tree, {...destination})
    )
  }
}

function toMdast(tree: Ascii.Document, options?: Options): Mdast.Root {
  const userHandlers = options?.handlers ?? {}
  const unknownHandler = options?.unknownHandler

  const merged: Record<string, AsciiHandler> = {
    ...defaultHandlers,
    ...Object.fromEntries(Object.entries(userHandlers).filter(([, v]) => v != null)),
  } as Record<string, AsciiHandler>

  const state: ToMdastState = {
    one(node, parent) {
      const handler = merged[node.type] ?? unknownHandler
      if (!handler) return undefined
      const result = handler(state, node, parent)
      if (Array.isArray(result)) return result[0]
      return result
    },

    all(parent) {
      const results: Mdast.RootContent[] = []
      const children = (parent as any).children ?? []
      for (const child of children) {
        const handler = merged[child.type] ?? unknownHandler
        if (!handler) continue
        const result = handler(state, child, parent as any)
        if (!result) continue
        if (Array.isArray(result)) results.push(...result)
        else results.push(result)
      }
      return results
    },

    toMdastPhrasing(parent) {
      const results: Mdast.PhrasingContent[] = []
      const children = (parent as any).children ?? []
      for (const child of children) {
        const handler = merged[child.type] ?? unknownHandler
        if (!handler) continue
        const result = handler(state, child, parent as any)
        if (!result) continue
        if (Array.isArray(result)) {
          for (const r of result) results.push(r as Mdast.PhrasingContent)
        } else {
          results.push(result as Mdast.PhrasingContent)
        }
      }
      return results
    },

    patch(from, to) {
      if (from.position) {
        to.position = structuredClone(from.position)
      }
    },

    footnotes: new Map(),
    footnoteOrder: [],
  }

  // First pass: collect footnotes
  collectFootnotes(tree, state)

  // Convert the document
  const children = state.all(tree)

  // Prepend document title as an h1 heading when present
  if (tree.title) {
    const titleHeading: Mdast.Heading = {
      type: 'heading',
      depth: 1,
      children: [{type: 'text', value: tree.title}],
    }
    children.unshift(titleHeading)
  }

  // Append footnote definitions at the end
  const footnoteDefs = buildFootnoteDefinitions(state)

  const root: Mdast.Root = {type: 'root', children: [...children, ...footnoteDefs]}
  state.patch(tree, root)
  return root
}

// ---------------------------------------------------------------------------
// Footnote collection (pre-pass)
// ---------------------------------------------------------------------------

function collectFootnotes(node: any, state: ToMdastState) {
  if (node.type === 'footnote') {
    const fn = node as Ascii.Footnote
    const id = fn.identifier ?? `fn-${state.footnoteOrder.length + 1}`
    if (!state.footnotes.has(id)) {
      state.footnotes.set(id, fn)
      state.footnoteOrder.push(id)
    }
  }
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      collectFootnotes(child, state)
    }
  }
}

function buildFootnoteDefinitions(state: ToMdastState): Mdast.FootnoteDefinition[] {
  const defs: Mdast.FootnoteDefinition[] = []
  for (const id of state.footnoteOrder) {
    const fn = state.footnotes.get(id)!
    const children = state.toMdastPhrasing(fn)
    const para: Mdast.Paragraph = {type: 'paragraph', children}
    const def: Mdast.FootnoteDefinition = {
      type: 'footnoteDefinition',
      identifier: id,
      label: id,
      children: [para],
    }
    state.patch(fn, def)
    defs.push(def)
  }
  return defs
}

// ---------------------------------------------------------------------------
// Default handlers
// ---------------------------------------------------------------------------

const defaultHandlers: Record<string, AsciiHandler> = {
  // -- Structural ----------------------------------------------------------
  preamble: handlePreamble,
  section: handleSection,

  // -- Block ---------------------------------------------------------------
  paragraph: handleParagraph,
  admonition: handleAdmonition,
  listing: handleListing,
  literal: handleLiteral,
  example: handleExample,
  sidebar: handleSidebar,
  quote: handleQuote,
  verse: handleVerse,
  open: handleOpen,
  pass: handlePass,
  stem: handleStem,
  table: handleTable,
  image: handleImage,
  audio: handleAudio,
  video: handleVideo,
  thematicBreak: handleThematicBreak,
  pageBreak: handlePageBreak,
  toc: handleToc,
  floatingTitle: handleFloatingTitle,

  // -- Lists ---------------------------------------------------------------
  unorderedList: handleUnorderedList,
  orderedList: handleOrderedList,
  descriptionList: handleDescriptionList,
  calloutList: handleCalloutList,
  listItem: handleListItem,
  descriptionListEntry: handleDescriptionListEntry,
  descriptionListTerm: handleDescriptionListTerm,
  descriptionListDescription: handleDescriptionListDescription,

  // -- Table internals -----------------------------------------------------
  tableHead: handleTableSection,
  tableBody: handleTableSection,
  tableFoot: handleTableSection,
  tableRow: handleTableRow,
  tableCell: handleTableCell,

  // -- Inline --------------------------------------------------------------
  text: handleText,
  strong: handleStrong,
  emphasis: handleEmphasis,
  monospaced: handleMonospaced,
  mark: handleMark,
  superscript: handleSuperscript,
  subscript: handleSubscript,
  doubleQuoted: handleDoubleQuoted,
  singleQuoted: handleSingleQuoted,
  link: handleLink,
  crossReference: handleCrossReference,
  anchor: handleAnchor,
  bibliographyReference: handleBibliographyReference,
  inlineImage: handleInlineImage,
  icon: handleIcon,
  footnote: handleFootnote,
  lineBreak: handleLineBreak,
  inlineCallout: handleInlineCallout,
  keyboard: handleKeyboard,
  button: handleButton,
  menu: handleMenu,
  indexTerm: handleIndexTerm,
  inlinePass: handleInlinePass,
}

// ---------------------------------------------------------------------------
// Structural handlers
// ---------------------------------------------------------------------------

function handlePreamble(state: ToMdastState, node: any): Mdast.RootContent[] {
  return state.all(node)
}

function handleSection(state: ToMdastState, node: any): Mdast.RootContent[] {
  const section = node as Ascii.Section
  const depth = Math.min(Math.max((section.depth ?? 0) + 1, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6
  const heading: Mdast.Heading = {
    type: 'heading',
    depth,
    children: [{type: 'text', value: section.title}],
  }
  state.patch(node, heading)

  const children = state.all(node)
  return [heading, ...children]
}

// ---------------------------------------------------------------------------
// Block handlers
// ---------------------------------------------------------------------------

function handleParagraph(state: ToMdastState, node: any): Mdast.Paragraph {
  const result: Mdast.Paragraph = {
    type: 'paragraph',
    children: state.toMdastPhrasing(node),
  }
  state.patch(node, result)
  return result
}

function handleAdmonition(state: ToMdastState, node: any): Mdast.Blockquote {
  const adm = node as Ascii.Admonition
  const label = (adm.name ?? 'note').toUpperCase()
  const prefix: Mdast.Paragraph = {
    type: 'paragraph',
    children: [{type: 'strong', children: [{type: 'text', value: label}]}],
  }
  const children = state.all(node) as Array<Mdast.BlockContent | Mdast.DefinitionContent>
  const result: Mdast.Blockquote = {
    type: 'blockquote',
    children: [prefix, ...children],
    data: {asciiType: 'admonition', admonitionName: adm.name} as any,
  }
  state.patch(node, result)
  return result
}

function handleListing(state: ToMdastState, node: any): Mdast.Code {
  const listing = node as Ascii.Listing
  const result: Mdast.Code = {
    type: 'code',
    value: listing.value,
    lang: listing.language ?? null,
  }
  state.patch(node, result)
  return result
}

function handleLiteral(state: ToMdastState, node: any): Mdast.Code {
  const lit = node as Ascii.Literal
  const result: Mdast.Code = {
    type: 'code',
    value: lit.value,
  }
  state.patch(node, result)
  return result
}

function handleExample(state: ToMdastState, node: any): Mdast.Blockquote {
  const ex = node as Ascii.Example
  const children = state.all(node) as Array<Mdast.BlockContent | Mdast.DefinitionContent>
  const nodes: Array<Mdast.BlockContent | Mdast.DefinitionContent> = []
  if (ex.title) {
    nodes.push({type: 'paragraph', children: [{type: 'emphasis', children: [{type: 'text', value: ex.title}]}]})
  }
  nodes.push(...children)
  const result: Mdast.Blockquote = {
    type: 'blockquote',
    children: nodes,
    data: {asciiType: 'example'} as any,
  }
  state.patch(node, result)
  return result
}

function handleSidebar(state: ToMdastState, node: any): Mdast.Blockquote {
  const sb = node as Ascii.Sidebar
  const children = state.all(node) as Array<Mdast.BlockContent | Mdast.DefinitionContent>
  const nodes: Array<Mdast.BlockContent | Mdast.DefinitionContent> = []
  if (sb.title) {
    nodes.push({type: 'paragraph', children: [{type: 'strong', children: [{type: 'text', value: sb.title}]}]})
  }
  nodes.push(...children)
  const result: Mdast.Blockquote = {
    type: 'blockquote',
    children: nodes,
    data: {asciiType: 'sidebar'} as any,
  }
  state.patch(node, result)
  return result
}

function handleQuote(state: ToMdastState, node: any): Mdast.Blockquote {
  const quote = node as Ascii.Quote
  const children = state.all(node) as Array<Mdast.BlockContent | Mdast.DefinitionContent>
  if (quote.attribution) {
    children.push({
      type: 'paragraph',
      children: [{type: 'text', value: `\u2014 ${quote.attribution}`}],
    })
  }
  const result: Mdast.Blockquote = {
    type: 'blockquote',
    children,
  }
  state.patch(node, result)
  return result
}

function handleVerse(state: ToMdastState, node: any): Mdast.RootContent[] {
  const verse = node as Ascii.Verse
  const lines = verse.value.split('\n')
  const phrasingChildren: Mdast.PhrasingContent[] = []
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) phrasingChildren.push({type: 'break'} as Mdast.Break)
    phrasingChildren.push({type: 'text', value: lines[i]} as Mdast.Text)
  }
  const para: Mdast.Paragraph = {
    type: 'paragraph',
    children: phrasingChildren,
  }
  state.patch(node, para)
  const results: Mdast.RootContent[] = [para]
  if (verse.attribution) {
    results.push({
      type: 'paragraph',
      children: [{type: 'text', value: `\u2014 ${verse.attribution}`}],
    })
  }
  return results
}

function handleOpen(state: ToMdastState, node: any): Mdast.RootContent[] {
  return state.all(node)
}

function handlePass(state: ToMdastState, node: any): Mdast.Html {
  const pass = node as Ascii.Pass
  const result: Mdast.Html = {type: 'html', value: pass.value}
  state.patch(node, result)
  return result
}

function handleStem(state: ToMdastState, node: any): Mdast.Code {
  const stem = node as Ascii.Stem
  const result: Mdast.Code = {
    type: 'code',
    value: stem.value,
    lang: stem.style === 'latexmath' ? 'latex' : stem.style === 'asciimath' ? 'asciimath' : 'math',
    meta: 'math',
  }
  state.patch(node, result)
  return result
}

// ---------------------------------------------------------------------------
// Inline-node set (used by table and cell helpers)
// ---------------------------------------------------------------------------

const INLINE_NODE_TYPES = new Set([
  'text', 'strong', 'emphasis', 'monospaced', 'mark',
  'superscript', 'subscript', 'doubleQuoted', 'singleQuoted',
  'link', 'crossReference', 'anchor', 'bibliographyReference',
  'inlineImage', 'icon', 'footnote', 'lineBreak', 'inlineCallout',
  'keyboard', 'button', 'menu', 'indexTerm', 'inlinePass',
])

function isInlineNode(node: any): boolean {
  return INLINE_NODE_TYPES.has(node.type)
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function handleTable(state: ToMdastState, node: any): Mdast.RootContent {
  const table = node as Ascii.Table

  // Detect whether any cell has block content (style=asciidoc or non-inline children)
  if (tableHasBlockCells(table)) {
    return buildRichTable(state, table)
  }

  const align: Mdast.AlignType[] = (table.columns ?? []).map(c => {
    if (c.halign === 'left') return 'left'
    if (c.halign === 'right') return 'right'
    if (c.halign === 'center') return 'center'
    return null
  })

  // Flatten head/body/foot sections into direct rows
  const rows: Mdast.TableRow[] = []
  for (const section of table.children) {
    if ('children' in section) {
      for (const row of (section as any).children) {
        const mdastRow = state.one(row, node) as Mdast.TableRow | undefined
        if (mdastRow) rows.push(mdastRow)
      }
    }
  }

  const result: Mdast.Table = {type: 'table', align, children: rows}
  state.patch(node, result)
  return result
}

/** Check whether any cell in the table contains block-level content. */
function tableHasBlockCells(table: Ascii.Table): boolean {
  for (const section of table.children) {
    if (!('children' in section)) continue
    for (const row of (section as any).children) {
      if (!row.children) continue
      for (const cell of row.children) {
        if (cell.style === 'asciidoc') return true
        if (cell.children?.some((c: any) => !INLINE_NODE_TYPES.has(c.type) && c.type !== 'paragraph')) {
          return true
        }
      }
    }
  }
  return false
}

/**
 * Build a table using custom mdast nodes with data.hName so that
 * remark-rehype renders them as proper HTML elements.
 * This preserves block content (lists, code, nested paragraphs) in cells.
 */
function buildRichTable(state: ToMdastState, table: Ascii.Table): Mdast.RootContent {
  const sections: any[] = []

  for (const section of table.children) {
    if (!('children' in section)) continue
    const sectionTag =
      section.type === 'tableHead' ? 'thead' :
      section.type === 'tableFoot' ? 'tfoot' : 'tbody'

    const rows: any[] = []
    for (const row of (section as any).children) {
      const cellTag = section.type === 'tableHead' ? 'th' : 'td'
      const cells: any[] = []
      for (const cell of row.children) {
        const cellChildren = buildRichCellChildren(state, cell)
        cells.push({
          type: 'richTableCell',
          data: {hName: cellTag},
          children: cellChildren,
        })
      }
      rows.push({
        type: 'richTableRow',
        data: {hName: 'tr'},
        children: cells,
      })
    }
    sections.push({
      type: 'richTableSection',
      data: {hName: sectionTag},
      children: rows,
    })
  }

  const result: any = {
    type: 'richTable',
    data: {hName: 'table'},
    children: sections,
  }
  state.patch(table as any, result)
  return result
}

/**
 * Convert a table cell's children to mdast, preserving block content.
 * For cells with only inline/paragraph content we wrap in a single paragraph.
 * For cells with block content (lists, code, etc.) we convert each block.
 */
function buildRichCellChildren(state: ToMdastState, cell: Ascii.TableCell): Mdast.RootContent[] {
  const hasBlocks = cell.style === 'asciidoc' ||
    cell.children.some((c: any) => !INLINE_NODE_TYPES.has(c.type) && c.type !== 'paragraph')

  if (!hasBlocks) {
    // Inline-only cell — produce a paragraph with phrasing content
    const phrasing = cellToPhrasing(state, cell)
    if (phrasing.length === 0) return []
    return [{type: 'paragraph', children: phrasing} as Mdast.Paragraph]
  }

  // Block cell — convert each child through the normal block pipeline
  const results: Mdast.RootContent[] = []
  for (const child of cell.children) {
    if (isInlineNode(child)) {
      // Stray inline node — wrap in paragraph
      const wrapper = {children: [child]} as any
      const phrasing = state.toMdastPhrasing(wrapper)
      if (phrasing.length > 0) {
        results.push({type: 'paragraph', children: phrasing} as Mdast.Paragraph)
      }
    } else {
      const converted = state.one(child as any, cell as any)
      if (converted) {
        if (Array.isArray(converted)) {
          results.push(...(converted as Mdast.RootContent[]))
        } else {
          results.push(converted as Mdast.RootContent)
        }
      }
    }
  }
  return results
}

function handleImage(state: ToMdastState, node: any): Mdast.RootContent {
  const img = node as Ascii.Image
  const image: Mdast.Image = {
    type: 'image',
    url: img.target,
    alt: img.alt ?? undefined,
    title: img.title ?? undefined,
  }
  state.patch(node, image)

  // If the image has a title / caption, wrap in a <figure> with <figcaption>
  if (img.title) {
    const result: any = {
      type: 'figure',
      data: {hName: 'figure'},
      children: [
        {type: 'paragraph', children: [image]},
        {
          type: 'figcaption',
          data: {hName: 'figcaption'},
          children: [{type: 'paragraph', children: [{type: 'text', value: img.title}]}],
        },
      ],
    }
    return result
  }

  const result: Mdast.Paragraph = {type: 'paragraph', children: [image]}
  return result
}

function handleAudio(state: ToMdastState, node: any): Mdast.RootContent {
  const audio = node as Ascii.Audio
  const result: any = {
    type: 'audio',
    data: {
      hName: 'audio',
      hProperties: {
        src: audio.target,
        controls: true,
      },
    },
    children: [{
      type: 'paragraph',
      children: [{type: 'text', value: audio.title ?? audio.target}],
    }],
  }
  state.patch(node, result)
  return result
}

function handleVideo(state: ToMdastState, node: any): Mdast.RootContent {
  const video = node as Ascii.Video
  const attrs = video.attributes ?? {} as Record<string, any>
  const poster = attrs.poster ?? attrs['$positional'] ?? ''
  const width = attrs.width ?? '640'
  const height = attrs.height ?? '360'

  // YouTube embed
  if (poster === 'youtube' || String(poster).includes('youtube')) {
    const result: any = {
      type: 'video',
      data: {
        hName: 'iframe',
        hProperties: {
          src: `https://www.youtube.com/embed/${video.target}`,
          width,
          height,
          frameBorder: '0',
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          allowFullScreen: true,
          style: 'max-width:100%',
        },
      },
      children: [],
    }
    state.patch(node, result)
    return result
  }

  // Vimeo embed
  if (poster === 'vimeo' || String(poster).includes('vimeo')) {
    const result: any = {
      type: 'video',
      data: {
        hName: 'iframe',
        hProperties: {
          src: `https://player.vimeo.com/video/${video.target}`,
          width,
          height,
          frameBorder: '0',
          allow: 'autoplay; fullscreen; picture-in-picture',
          allowFullScreen: true,
          style: 'max-width:100%',
        },
      },
      children: [],
    }
    state.patch(node, result)
    return result
  }

  // Local / generic video
  const props: Record<string, any> = {
    src: video.target,
    controls: true,
    width,
  }
  if (poster && poster !== video.target) {
    props.poster = poster
  }
  const result: any = {
    type: 'video',
    data: {hName: 'video', hProperties: props},
    children: [{
      type: 'paragraph',
      children: [{type: 'text', value: video.title ?? video.target}],
    }],
  }
  state.patch(node, result)
  return result
}

function handleThematicBreak(state: ToMdastState, node: any): Mdast.ThematicBreak {
  const result: Mdast.ThematicBreak = {type: 'thematicBreak'}
  state.patch(node, result)
  return result
}

function handlePageBreak(state: ToMdastState, node: any): Mdast.ThematicBreak {
  const result: Mdast.ThematicBreak = {
    type: 'thematicBreak',
    data: {asciiType: 'pageBreak'} as any,
  }
  state.patch(node, result)
  return result
}

function handleToc(_state: ToMdastState, _node: any): undefined {
  return undefined
}

function handleFloatingTitle(state: ToMdastState, node: any): Mdast.Heading {
  const ft = node as Ascii.FloatingTitle
  const depth = Math.min(Math.max(ft.depth, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6
  const result: Mdast.Heading = {
    type: 'heading',
    depth,
    children: state.toMdastPhrasing(node),
  }
  state.patch(node, result)
  return result
}

// ---------------------------------------------------------------------------
// List handlers
// ---------------------------------------------------------------------------

function handleUnorderedList(state: ToMdastState, node: any): Mdast.List {
  const list = node as Ascii.UnorderedList
  const children = state.all(node) as Mdast.ListItem[]
  const result: Mdast.List = {
    type: 'list',
    ordered: false,
    spread: false,
    children,
  }
  state.patch(node, result)
  return result
}

function handleOrderedList(state: ToMdastState, node: any): Mdast.List {
  const list = node as Ascii.OrderedList
  const children = state.all(node) as Mdast.ListItem[]
  const result: Mdast.List = {
    type: 'list',
    ordered: true,
    start: list.start ?? 1,
    spread: false,
    children,
  }
  state.patch(node, result)
  return result
}

function handleDescriptionList(state: ToMdastState, node: any): Mdast.List {
  const children = state.all(node) as Mdast.ListItem[]
  const result: Mdast.List = {
    type: 'list',
    ordered: false,
    spread: false,
    children,
    data: {asciiType: 'descriptionList'} as any,
  }
  state.patch(node, result)
  return result
}

function handleCalloutList(state: ToMdastState, node: any): Mdast.List {
  const children = state.all(node) as Mdast.ListItem[]
  const result: Mdast.List = {
    type: 'list',
    ordered: true,
    spread: false,
    children,
    data: {asciiType: 'calloutList'} as any,
  }
  state.patch(node, result)
  return result
}

function handleListItem(state: ToMdastState, node: any): Mdast.ListItem {
  const li = node as Ascii.ListItem
  const children = state.all(node) as Mdast.RootContent[]
  const result: Mdast.ListItem = {
    type: 'listItem',
    spread: false,
    children: children as any,
  }
  if (li.checked != null) result.checked = li.checked
  state.patch(node, result)
  return result
}

function handleDescriptionListEntry(state: ToMdastState, node: any): Mdast.ListItem {
  const entry = node as Ascii.DescriptionListEntry
  const parts = state.all(node) as Mdast.RootContent[]
  const result: Mdast.ListItem = {
    type: 'listItem',
    spread: false,
    children: parts as any,
    data: {asciiType: 'descriptionListEntry'} as any,
  }
  state.patch(node, result)
  return result
}

function handleDescriptionListTerm(state: ToMdastState, node: any): Mdast.Paragraph {
  const phrasing = state.toMdastPhrasing(node)
  const result: Mdast.Paragraph = {
    type: 'paragraph',
    children: [{type: 'strong', children: phrasing}],
  }
  state.patch(node, result)
  return result
}

function handleDescriptionListDescription(state: ToMdastState, node: any): Mdast.RootContent[] {
  return state.all(node)
}

// ---------------------------------------------------------------------------
// Table internal handlers
// ---------------------------------------------------------------------------

function handleTableSection(state: ToMdastState, node: any): Mdast.RootContent[] {
  return state.all(node)
}

function handleTableRow(state: ToMdastState, node: any): Mdast.TableRow {
  const cells = state.all(node) as Mdast.TableCell[]
  const result: Mdast.TableRow = {type: 'tableRow', children: cells}
  state.patch(node, result)
  return result
}

function handleTableCell(state: ToMdastState, node: any): Mdast.TableCell {
  const cell = node as Ascii.TableCell
  // TableCell children can be block or inline; flatten to phrasing
  const phrasing = cellToPhrasing(state, cell)
  const result: Mdast.TableCell = {type: 'tableCell', children: phrasing}
  state.patch(node, result)
  return result
}

function cellToPhrasing(state: ToMdastState, cell: Ascii.TableCell): Mdast.PhrasingContent[] {
  const results: Mdast.PhrasingContent[] = []
  for (const child of cell.children) {
    if (child.type === 'paragraph') {
      if (results.length > 0) results.push({type: 'text', value: ' '})
      results.push(...state.toMdastPhrasing(child as any))
    } else if (isInlineNode(child)) {
      // Direct inline child — convert through the normal inline handler
      const wrapper = {children: [child]} as any
      const phrasing = state.toMdastPhrasing(wrapper)
      results.push(...phrasing)
    } else if ('children' in child && Array.isArray((child as any).children)) {
      // Block with children — try to extract text
      const inner = state.all(child as any)
      for (const n of inner) {
        if (results.length > 0) results.push({type: 'text', value: ' '})
        if (n.type === 'paragraph') {
          results.push(...(n as Mdast.Paragraph).children)
        } else {
          results.push({type: 'text', value: nodeToText(n)})
        }
      }
    } else if ('value' in child) {
      if (results.length > 0) results.push({type: 'text', value: ' '})
      results.push({type: 'text', value: (child as any).value})
    } else {
      if (results.length > 0) results.push({type: 'text', value: ' '})
      results.push({type: 'text', value: nodeToText(child)})
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Inline handlers
// ---------------------------------------------------------------------------

function handleText(state: ToMdastState, node: any): Mdast.Text {
  const result: Mdast.Text = {type: 'text', value: (node as Ascii.Text).value}
  state.patch(node, result)
  return result
}

function handleStrong(state: ToMdastState, node: any): Mdast.Strong {
  const result: Mdast.Strong = {
    type: 'strong',
    children: state.toMdastPhrasing(node),
  }
  state.patch(node, result)
  return result
}

function handleEmphasis(state: ToMdastState, node: any): Mdast.Emphasis {
  const result: Mdast.Emphasis = {
    type: 'emphasis',
    children: state.toMdastPhrasing(node),
  }
  state.patch(node, result)
  return result
}

function handleMonospaced(state: ToMdastState, node: any): Mdast.InlineCode {
  const result: Mdast.InlineCode = {
    type: 'inlineCode',
    value: (node as Ascii.Monospaced).value,
  }
  state.patch(node, result)
  return result
}

function handleMark(state: ToMdastState, node: any): Mdast.Emphasis {
  const result: Mdast.Emphasis = {
    type: 'emphasis',
    children: state.toMdastPhrasing(node),
    data: {asciiType: 'mark'} as any,
  }
  state.patch(node, result)
  return result
}

function handleSuperscript(state: ToMdastState, node: any): Mdast.RootContent {
  const children = state.toMdastPhrasing(node)
  const result: any = {
    type: 'superscript',
    data: {hName: 'sup'},
    children,
  }
  state.patch(node, result)
  return result
}

function handleSubscript(state: ToMdastState, node: any): Mdast.RootContent {
  const children = state.toMdastPhrasing(node)
  const result: any = {
    type: 'subscript',
    data: {hName: 'sub'},
    children,
  }
  state.patch(node, result)
  return result
}

function handleDoubleQuoted(state: ToMdastState, node: any): Mdast.RootContent[] {
  const inner = state.toMdastPhrasing(node)
  return [
    {type: 'text', value: '\u201c'} as any,
    ...inner as any[],
    {type: 'text', value: '\u201d'} as any,
  ]
}

function handleSingleQuoted(state: ToMdastState, node: any): Mdast.RootContent[] {
  const inner = state.toMdastPhrasing(node)
  return [
    {type: 'text', value: '\u2018'} as any,
    ...inner as any[],
    {type: 'text', value: '\u2019'} as any,
  ]
}

function handleLink(state: ToMdastState, node: any): Mdast.Link {
  const link = node as Ascii.Link
  const result: Mdast.Link = {
    type: 'link',
    url: link.url,
    title: link.title ?? undefined,
    children: state.toMdastPhrasing(node),
  }
  state.patch(node, result)
  return result
}

function handleCrossReference(state: ToMdastState, node: any): Mdast.Link {
  const xref = node as Ascii.CrossReference
  const children = state.toMdastPhrasing(node)
  if (children.length === 0) {
    children.push({type: 'text', value: xref.target})
  }
  const url = xref.path
    ? `${xref.path}${xref.fragment ? '#' + xref.fragment : ''}`
    : `#${xref.fragment ?? xref.target}`
  const result: Mdast.Link = {
    type: 'link',
    url,
    children,
    data: {asciiType: 'crossReference'} as any,
  }
  state.patch(node, result)
  return result
}

function handleAnchor(state: ToMdastState, node: any): Mdast.RootContent {
  const anchor = node as Ascii.Anchor
  const result: any = {
    type: 'anchor',
    data: {
      hName: 'a',
      hProperties: {id: anchor.identifier},
    },
    children: [],
  }
  state.patch(node, result)
  return result
}

function handleBibliographyReference(state: ToMdastState, node: any): Mdast.RootContent {
  const bib = node as Ascii.BibliographyReference
  const result: Mdast.Text = {
    type: 'text',
    value: `[${bib.label ?? bib.identifier}]`,
  }
  state.patch(node, result)
  return result
}

function handleInlineImage(state: ToMdastState, node: any): Mdast.Image {
  const img = node as Ascii.InlineImage
  const result: Mdast.Image = {
    type: 'image',
    url: img.target,
    alt: img.alt ?? undefined,
  }
  state.patch(node, result)
  return result
}

function handleIcon(state: ToMdastState, node: any): Mdast.Text {
  const icon = node as Ascii.Icon
  const result: Mdast.Text = {type: 'text', value: `:${icon.name}:`}
  state.patch(node, result)
  return result
}

function handleFootnote(state: ToMdastState, node: any): Mdast.FootnoteReference {
  const fn = node as Ascii.Footnote
  const id = fn.identifier ?? `fn-${state.footnoteOrder.indexOf(fn.identifier ?? '') + 1}`
  // The actual identifier was collected in the pre-pass; find it
  let resolvedId = id
  for (const [storedId, storedFn] of state.footnotes) {
    if (storedFn === fn) {
      resolvedId = storedId
      break
    }
  }
  const result: Mdast.FootnoteReference = {
    type: 'footnoteReference',
    identifier: resolvedId,
    label: resolvedId,
  }
  state.patch(node, result)
  return result
}

function handleLineBreak(state: ToMdastState, node: any): Mdast.Break {
  const result: Mdast.Break = {type: 'break'}
  state.patch(node, result)
  return result
}

function handleInlineCallout(state: ToMdastState, node: any): Mdast.Text {
  const co = node as Ascii.InlineCallout
  const result: Mdast.Text = {type: 'text', value: `(${co.number})`}
  state.patch(node, result)
  return result
}

function handleKeyboard(state: ToMdastState, node: any): Mdast.InlineCode {
  const kbd = node as Ascii.Keyboard
  const result: Mdast.InlineCode = {
    type: 'inlineCode',
    value: kbd.keys.join('+'),
  }
  state.patch(node, result)
  return result
}

function handleButton(state: ToMdastState, node: any): Mdast.Strong {
  const btn = node as Ascii.Button
  const result: Mdast.Strong = {
    type: 'strong',
    children: [{type: 'text', value: btn.label}],
  }
  state.patch(node, result)
  return result
}

function handleMenu(state: ToMdastState, node: any): Mdast.Text {
  const menu = node as Ascii.Menu
  const parts = [menu.menuName, ...menu.submenus, menu.menuitem]
  const result: Mdast.Text = {type: 'text', value: parts.join(' > ')}
  state.patch(node, result)
  return result
}

function handleIndexTerm(_state: ToMdastState, node: any): Mdast.RootContent | undefined {
  const term = node as Ascii.IndexTerm
  if (term.visible) {
    return {type: 'text', value: term.terms[0] ?? ''}
  }
  return undefined
}

function handleInlinePass(state: ToMdastState, node: any): Mdast.Html {
  const pass = node as Ascii.InlinePass
  const result: Mdast.Html = {type: 'html', value: pass.value}
  state.patch(node, result)
  return result
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function nodeToText(node: any): string {
  if (node.type === 'text') return node.value
  if ('value' in node) return node.value
  if ('children' in node && Array.isArray(node.children)) {
    return node.children.map(nodeToText).join('')
  }
  return ''
}

function phrasingToText(nodes: Mdast.PhrasingContent[]): string {
  return nodes.map(n => nodeToText(n)).join('')
}

