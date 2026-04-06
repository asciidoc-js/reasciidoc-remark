# reasciidoc-remark

**[reasciidoc][github-reasciidoc]** plugin that turns AsciiDoc into markdown to support
**[remark][github-remark]**.

## Contents

* [What is this?](#what-is-this)
* [When should I use this?](#when-should-i-use-this)
* [Install](#install)
* [Use](#use)
* [API](#api)
  * [`unified().use(reasciidocRemark[, destination][, options])`](#unifiedusereasciidocremark-destination-options)
  * [`Options`](#options)
* [Examples](#examples)
  * [Example: ignoring things](#example-ignoring-things)
  * [Example: keeping some AsciiDoc](#example-keeping-some-asciidoc)
* [Types](#types)
* [Compatibility](#compatibility)
* [Security](#security)
* [Related](#related)
* [Contribute](#contribute)
* [License](#license)

## What is this?

This package is a [unified][github-unified] ([reasciidoc][github-reasciidoc])
plugin that switches from
reasciidoc (the AsciiDoc ecosystem) to
remark (the markdown ecosystem).
It does this by transforming the current AsciiDoc (adast) syntax tree into a markdown
(mdast) syntax tree.
reasciidoc plugins deal with adast and remark plugins deal with mdast,
so plugins used after `reasciidoc-remark` have to be remark plugins.

The reason that there are different ecosystems for markdown and AsciiDoc is that
turning AsciiDoc into markdown is,
while frequently needed,
not the only purpose of AsciiDoc.
Checking (linting) and formatting AsciiDoc are also common use cases for
reasciidoc and AsciiDoc.
There are several aspects of AsciiDoc that do not translate 1-to-1 to markdown.
In some cases AsciiDoc contains more information than markdown:
for example,
there are several ways to add a link in AsciiDoc
(as in,
autolinks: `https://url`,
resource links: `link:label[url]`,
and reference links with definitions).
In other cases markdown contains more information than AsciiDoc:
there are many elements,
which add new meaning (semantics),
available in markdown that aren’t available in AsciiDoc.
If there was just one AST,
it would be quite hard to perform the tasks that several remark and reasciidoc
plugins currently do.

**unified** is a project that transforms content with abstract syntax trees
(ASTs).
**remark** adds support for markdown to unified.
**reasciidoc** adds support for AsciiDoc to unified.
**mdast** is the markdown AST that remark uses.
**adast** is the AsciiDoc AST that reasciidoc uses.
This is a reasciidoc plugin that transforms adast into mdast to support remark.

## When should I use this?

This project is useful when you want to turn AsciiDoc to markdown.

The remark plugin [`@asciidoc-js/remark-reasciidoc`][github-remark-reasciidoc] does the inverse of
this plugin.
It turns markdown into AsciiDoc.

## Install

This package is [ESM only][github-gist-esm].
In Node.js (version 16+),
install with [npm][npmjs-install]:

```sh
npm install reasciidoc-remark
```

In Deno with [`esm.sh`][esmsh]:

```js
import reasciidocRemark from 'https://esm.sh/reasciidoc-remark@10'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import reasciidocRemark from 'https://esm.sh/reasciidoc-remark@10?bundle'
</script>
```

## Use

Say we have the following module `example.js`:

```js
import reasciidocParse from '@asciidoc-js/reasciidoc-parse'
import reasciidocRemark from '@asciidoc-js/reasciidoc-remark'
import remarkStringify from 'remark-stringify'
import {fetch} from 'undici'
import {unified} from 'unified'

const text = "= Example Document\nDoc Writer <doc@example.com>\n\nAn example of a basic https://asciidoc.org[AsciiDoc] document prepared by {author}."

const file = await unified()
  .use(reasciidocParse)
  .use(reasciidocRemark)
  .use(remarkStringify)
  .process(text)

console.log(String(file))
```

Now running `node example.js` yields:

```markdown
# Example Document

An example of a basic [AsciiDoc](https://asciidoc.org) document prepared by   Doc Writer.
```

## API

This package exports no identifiers.
The default export is [`reasciidocRemark`][api-reasciidoc-remark].

### `unified().use(reasciidocRemark[, destination][, options])`

Turn AsciiDoc into markdown.

###### Parameters

* `destination`
  ([`Processor`][github-unified-processor], optional)
  — processor
* `options`
  ([`Options`][api-options], optional)
  — configuration

###### Returns

Transform ([`Transformer`][github-unified-transformer]).

###### Notes

* if a [processor][github-unified-processor] is given,
  runs the (remark) plugins used on it with an mdast tree,
  then discards the result
  ([*bridge mode*][github-unified-mode])
* otherwise,
  returns an mdast tree,
  the plugins used after `reasciidocRemark` are remark plugins
  ([*mutate mode*][github-unified-mode])

> 👉 **Note**:
> It’s highly unlikely that you want to pass a `processor`.

### `Options`

Configuration (TypeScript type).

###### Fields

* `checked`
  (`string`, default: `'[x]'`)
  — value to use for a checked checkbox or radio input
* `document`
  (`boolean`, default: `true`)
  — whether the given tree represents a complete document;
  when the tree represents a complete document,
  then things are wrapped in paragraphs when needed,
  and otherwise they’re left as-is
* `handlers`
  (`Record<string, Handle>`, optional)
  — object mapping tag names to functions handling the corresponding
  elements;
  merged into the defaults;
  see
  [`Handle` in `adast-util-to-mdast`][github-adast-util-to-mdast-handle]
* `newlines`
  (`boolean`, default: `false`)
  — keep line endings when collapsing whitespace;
  the default collapses to a single space
* `nodeHandlers`
  (`Record<string, NodeHandle>`, optional)
  — object mapping node types to functions handling the corresponding nodes;
  merged into the defaults;
  see
  [`NodeHandle` in `adast-util-to-mdast`][github-adast-util-to-mdast-node-handle]
* `quotes` (`Array<string>`, default: `['"']`)
  — list of quotes to use;
  each value can be one or two characters;
  when two,
  the first character determines the opening quote and the second the closing
  quote at that level;
  when one,
  both the opening and closing quote are that character;
  the order in which the preferred quotes appear determines which quotes to use
  at which level of nesting;
  so,
  to prefer `‘’` at the first level of nesting,
  and `“”` at the second,
  pass `['‘’', '“”']`;
  if `<q>`s are nested deeper than the given amount of quotes,
  the markers wrap around:
  a third level of nesting when using `['«»', '‹›']` should have double
  guillemets,
  a fourth single, a fifth double again,
  etc
* `unchecked`
  (`string`, default: `'[ ]'`)
  — value to use for an unchecked checkbox or radio input

## Examples

### Example: ignoring things

It’s possible to exclude something from within AsciiDoc when turning it into
markdown,
by wrapping it in an element with a `data-mdast` attribute set to `'ignore'`.
For example:

```
*Importance* and _emphasis_.
```

With emphasis ignored:

```
**Importance** and .
```

It’s also possible to pass a handler to ignore nodes,
or create your own plugin that uses more advanced filters.

### Example: keeping some AsciiDoc

The goal of this project is to map AsciiDoc to plain and readable markdown.
That means that certain elements are ignored (such as complex macros) or "downgraded"
(such as videos to links).
You can change this by passing handlers.

Say we have the following file `example.adoc`:

```
audio::ocean-waves.wav[start=60,opts=autoplay]
```

And our module `example.js` looks as follows:

```js
/**
 * @import {Html} from 'mdast'
 */

import reasciidocParse from '@asciidoc-js/reasciidoc-parse'
import reasciidocRemark from '@asciidoc-js/reasciidoc-remark'
import remarkStringify from 'remark-stringify'
import {read} from 'to-vfile'
import {unified} from 'unified'

const file = await unified()
  .use(reasciidocParse, {fragment: true})
  .use(reasciidocRemark, {
    handlers: {
      audio(state, node) {
        /** @type {Html} */
        const result = {type: 'html', value: `<audio src="${node.target}" controls />`}
        state.patch(node, result)
        return result
      }
    }
  })
  .use(remarkStringify)
  .process(await read('example.adoc'))

console.log(String(file))
```

Now running `node example.js` yields:

```
<audio src="ocean-waves.wav" controls />
```

## Types

This package is fully typed with [TypeScript][].
It exports the additional type [`Options`][api-options].
More advanced types are exposed from
[`adast-util-to-mdast`][github-adast-util-to-mdast].

## Compatibility

Projects maintained by the unified collective are compatible with maintained
versions of Node.js.

When we cut a new major release,
we drop support for unmaintained versions of Node.
This means we try to keep the current release line,
`@asciidoc-js/reasciidoc-remark@0.1.0`,
compatible with Node.js 16.

This plugin works with `unified` version 6+, `@asciidoc-js/reasciidoc-parse`,
and `remark-stringify` version 3+ (used in `remark` version 7).

## Security

Use of `@asciidoc-js/reasciidoc-remark` is safe by default.

## Related

* [`@asciidoc-js/remark-reasciidoc`][github-remark-reasciidoc]
  — remark plugin to turn markdown into AsciiDoc
* [`remark-rehype`][github-remark-rehype]
  — remark plugin to turn markdown into HTML
* [`rehype-remark`][github-rehype-remark]
  — rehype plugin to turn HTML into markdown

## License

[MIT][file-license] © [Pablo Angelani]

<!-- Definitions -->

[api-options]: #options

[api-reasciidoc-remark]: #unifiedusereasciidocremark-destination-options

[badge-build-image]: https://github.com/asciidoc-js/reasciidoc-remark/workflows/main/badge.svg

[badge-build-url]: https://github.com/asciidoc-js/reasciidoc-remark/actions

[badge-coverage-image]: https://img.shields.io/codecov/c/github/asciidoc-js/reasciidoc-remark.svg

[badge-coverage-url]: https://codecov.io/github/asciidoc-js/reasciidoc-remark

[badge-downloads-image]: https://img.shields.io/npm/dm/reasciidoc-remark.svg

[badge-downloads-url]: https://www.npmjs.com/package/reasciidoc-remark

[badge-size-image]: https://img.shields.io/bundlejs/size/reasciidoc-remark

[badge-size-url]: https://bundlejs.com/?q=reasciidoc-remark

[esmsh]: https://esm.sh

[file-license]: license

[github-gist-esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[github-adast-util-to-mdast]: https://github.com/syntax-tree/adast-util-to-mdast

[github-adast-util-to-mdast-handle]: https://github.com/syntax-tree/adast-util-to-mdast#handle

[github-adast-util-to-mdast-node-handle]: https://github.com/syntax-tree/adast-util-to-mdast#nodehandle

[github-reasciidoc]: https://github.com/asciidoc-js/reasciidoc

[github-remark]: https://github.com/remarkjs/remark

[github-remark-reasciidoc]: https://github.com/asciidoc-js/remark-reasciidoc

[github-remark-rehype]: https://github.com/remarkjs/remark-rehype

[github-rehype-remark]: https://github.com/rehypejs/rehype-remark

[github-unified]: https://github.com/unifiedjs/unified

[github-unified-mode]: https://github.com/unifiedjs/unified#transforming-between-ecosystems

[github-unified-processor]: https://github.com/unifiedjs/unified#processor

[github-unified-transformer]: https://github.com/unifiedjs/unified#transformer

[health]: https://github.com/asciidoc-js/.github

[health-coc]: https://github.com/asciidoc-js/.github/blob/main/code-of-conduct.md

[health-contributing]: https://github.com/asciidoc-js/.github/blob/main/contributing.md

[health-support]: https://github.com/asciidoc-js/.github/blob/main/support.md

[npmjs-install]: https://docs.npmjs.com/cli/install

[typescript]: https://www.typescriptlang.org

[wooorm]: https://wooorm.com