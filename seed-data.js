// Seed content — the original static todo list, transcribed.
// Seeded into SQLite only on first run (when the categories table is empty).
module.exports = [
  {
    name: 'house & renovation',
    todos: [
      { text: 'Patch holes and walls' },
      { text: 'Build high wall shelves' },
      { text: 'Change backsplash tiling' },
      { text: 'Find a new centre light for the living room' },
      { text: 'Get larger recycling bins' },
      { text: 'Organise tools in garage' },
      { text: 'Tidy up by the 3D printer' },
      { text: 'Tidy up balcony' },
      { text: 'Finish backyard' },
    ],
  },
  {
    name: 'furniture & appliances',
    todos: [
      { text: 'Buy a standing freezer' },
      { text: 'Sell the old chest freezer' },
      { text: 'Get a desk for the living room' },
      { text: 'Purchase a soldering iron & solder the lights in the bedroom shelves' },
      { text: 'Find a new dining table' },
      { text: 'Sand and stain the dining table' },
      { text: 'Build a frame for the Lego art' },
      { text: '3D print wall mount for Mac Mini & bedroom remotes' },
      { text: 'Buy a large rug, larger than 235 cm' },
    ],
  },
  {
    name: 'projects to build',
    todos: [
      {
        text: 'Podcast app',
        note: 'Import listening progress + followed shows from Spotify. Automatic transcription. Detect & skip ad sections.\nRelated: PodcastAdSkipper (github.com/skorotkiewicz/PodcastAdSkipper), Podcast-Ad-Detector (github.com/SwanandM/Podcast-Ad-Detector), AudioCraft (github.com/microsoft/audiocraft) for audio segmentation, pyannote-audio (github.com/pyannote/pyannote-audio) for speaker segmentation / ad-break detection.',
      },
      { text: 'Train a Whisper model on my own dictation for a Mac hotkey typing tool',
        note: 'Likely a LoRA adapter on a Whisper base, fine-tuned on personal voice samples.' },
      { text: 'Live online interface to the PhD thesis vault',
        note: 'Obsidian-like but calmer. An opencode-style adapter to talk to an AI model over the vault. Must be well-saved and secure.' },
      { text: 'Room designer app in Three.js & VR' },
      { text: 'Self-hosted library system' },
      { text: 'Move *.javagrant.ac.nz services to Mac Mini server',
        note: 'Host & serve tools from the Mac Mini instead of GitHub Pages. Password-protect access. Includes: todo list, room planner (Three.js), thesis writing tool, and other javagrant.ac.nz subdomains.' },
      { text: 'Deal-finding tool for Trade Me & Facebook Marketplace',
        note: 'Scrape or monitor listings across both platforms. Identify underpriced items, alert on good deals matching watched categories/keywords. Use image embeddings & LLMs to infer missing details from listing photos (e.g. detect "round table" from an image when the lister only wrote "table"). Build a richer search index than the platforms provide.' },
      { text: 'AI listing assistant for Facebook Marketplace',
        note: 'Agent skill/prompt that accesses Marketplace to create listings. Researches comparable sold items to suggest reasonable prices. Could be an opencode skill or standalone agent.' },
      { text: 'General improvements to javagrant.com portfolio site & port to javagrant.ac.nz' },
      { text: 'AI workflow to build a meal plan from supermarket specials' },
      { text: 'Preference-unpacking app for social media exports',
        note: 'Ingest data exports (TikTok likes/comments, sent TikToks, YouTube watch history, etc.). Transcribe videos, take & embed screenshots. Use LLMs to extract topics, themes, and patterns. Feed all comparators into a model that predicts what kind of content someone likes.' },
      { text: 'Set up automatic turn on for Mac Mini when power is on' },
      { text: 'macOS toolbar API key tracker & usage reset',
        note: 'Track multiple keys across LLM providers. Start with OpenCode and Pioneer AI. Handle unknown Pioneer per-key reset times by deriving them from moments when available credit increases (24h cycle).' },
    ],
  },
  {
    name: 'research / scope (PhD)',
    todos: [
      { text: 'Build a storage adapter for Scope & Workbench that hooks up to university shared drives',
        note: "So I'm not holding research data directly." },
      { text: 'Investigate Turso as an alternative to SQLite for Scope',
        note: 'Turso supports vector search by default.' },
      { text: 'Improve the Studio interface: make transcript segments inline-editable, inline-taggable, etc. More whitespace, nicer font.',
        note: 'Favour aesthetics and uncommon power-user tools over ease of use.' },
      { text: 'Write thesis methodology and method' },
      { text: 'Input existing writing into the PhD thesis vault' },
    ],
  },
  {
    name: 'teaching & university',
    todos: [
      { text: 'Mark final assignments for COMMS 323' },
      { text: 'Give Bruce the plan for student day, SAANZ 2026' },
    ],
  },
  {
    name: 'declutter & sell',
    todos: [
      { text: 'Sell some board games' },
      { text: 'Consolidate Catan into fewer boxes' },
      { text: 'Filter clothes in the wardrobe' },
    ],
  },
  {
    name: 'agents & prompts',
    todos: [
      { text: 'Create an agent prompt that helps me find people to follow and improve my feeds on YouTube, GitHub and similar' },
      { text: 'Develop an anti-slop version of the find skills agent skill' },
    ],
  },
  {
    name: 'life admin',
    todos: [
      { text: 'Update the account the bank cards are connected to' },
      { text: 'Buy Taylor an electric drum kit' },
    ],
  },
];
