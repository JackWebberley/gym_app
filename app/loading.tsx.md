# Why there is no `loading.tsx`

There was one, and it broke the whole app in a way that looked like every button
was dead.

A root `loading.tsx` wraps every page in a Suspense boundary. On this stack —
Next 16 + OpenNext + Cloudflare Workers — that boundary **never resolves on the
client**. The server streams the real content into the HTML, so the page looks
correct, but React leaves the skeleton mounted and never hydrates the subtree
beneath it. The layout is outside the boundary, so the bottom nav stays
interactive, which makes it look like the page "sometimes works".

Measured on a fresh load with the boundary in place:

    hydratedOnFreshLoad: false
    skeletonsStuck:      14      ← skeleton still in the DOM beside real content
    posts:               []      ← clicks fire no server action at all

Without it, the same page:

    hydratedOnFreshLoad: true
    skeletonsStuck:      0
    cookCountProgression: [3, 2, 1, 0]

The cost is that a navigation shows the previous page until the next one is
ready, rather than a skeleton. That is worth paying for a page that responds to
taps. If it is worth another go later, the thing to try is a narrower Suspense
boundary inside a single page rather than a root `loading.tsx`, and to verify
hydration on a **fresh load** (not a client-side navigation, which masks it).
