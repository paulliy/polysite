<script setup lang="ts">
import { computed, h, type VNode } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { contentForPath } from '@/content/loader'
import { toSemanticBlocks } from '@/engine/paginate'
import type { InlineSegment, SemanticBlock } from '@/engine/types'

/**
 * The visually-hidden parallel DOM (CLAUDE.md #11): a real, semantic copy of
 * the current page — headings, paragraphs, lists, and working links — so
 * screen readers and Ctrl+F operate normally even though the visible board is
 * an aria-hidden grid of characters.
 */

const NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'Projects', href: '/projects' },
  { label: 'About', href: '/about' },
]

const route = useRoute()

type Node =
  | { type: 'heading' | 'paragraph'; block: SemanticBlock }
  | { type: 'list'; items: InlineSegment[][] }

/** Group the flat block list, merging consecutive list items into one list. */
const nodes = computed<Node[]>(() => {
  const blocks = toSemanticBlocks(contentForPath(route.path))
  const out: Node[] = []
  let list: { type: 'list'; items: InlineSegment[][] } | null = null
  for (const block of blocks) {
    if (block.kind === 'listItem') {
      if (!list) {
        list = { type: 'list', items: [] }
        out.push(list)
      }
      list.items.push(block.segments)
    } else {
      list = null
      out.push({ type: block.kind, block })
    }
  }
  return out
})

function headingTag(level: number | undefined): string {
  return `h${Math.min(6, Math.max(1, level ?? 2))}`
}

/** Inline segments as text + working links (RouterLink for internal routes). */
function Segments(props: { segments: InlineSegment[] }): (VNode | string)[] {
  return props.segments.map((seg, i) => {
    if (!seg.href) return seg.text
    if (seg.href.startsWith('/')) return h(RouterLink, { to: seg.href, key: i }, () => seg.text)
    const external = !seg.href.startsWith('mailto:')
    return h(
      'a',
      {
        href: seg.href,
        key: i,
        ...(external ? { target: '_blank', rel: 'noopener' } : {}),
      },
      seg.text,
    )
  })
}
</script>

<template>
  <div class="sr-only">
    <nav aria-label="Site">
      <RouterLink v-for="item in NAV_ITEMS" :key="item.href" :to="item.href">
        {{ item.label }}
      </RouterLink>
    </nav>
    <main>
      <template v-for="(node, i) in nodes" :key="i">
        <component :is="headingTag(node.block.level)" v-if="node.type === 'heading'">
          <Segments :segments="node.block.segments" />
        </component>
        <p v-else-if="node.type === 'paragraph'">
          <Segments :segments="node.block.segments" />
        </p>
        <ul v-else-if="node.type === 'list'">
          <li v-for="(item, j) in node.items" :key="j">
            <Segments :segments="item" />
          </li>
        </ul>
      </template>
    </main>
  </div>
</template>
