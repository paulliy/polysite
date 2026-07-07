# Paginating markdown for a fixed grid

Articles on this site are markdown files. The board is a fixed grid of
character cells. Something has to turn one into the other, and that
something can't measure text with a DOM - it has to know exactly which
character lands in which cell.

## Lines first

The paginator parses a small markdown subset: headings, paragraphs,
list items, and links. Paragraphs collapse their whitespace and wrap
greedily to the grid's column width. Words longer than a line are
hard-broken, list items get a two-space hanging indent, and link spans
are carried through the wrap so a link that breaks across two lines
still knows which columns it owns on each.

## Then pages

Wrapped lines are sliced into frames - one frame per screen of content.
The pagination is book-style: a paragraph that doesn't fit continues on
the next frame, no widow-and-orphan cleverness. The single concession
to typography is that a frame never opens on a blank separator line.

Scrolling doesn't move pixels; it moves an index into that frame list.
The differ takes care of the rest.

Back to [projects](/projects).
