<p align="center">
   <img src="./src/icon.png" width="96" alt="Familiar icon" />
</p>

<h1 align="center">Familiar</h1>

This week we asked AI:

-   *"What decisions did we actually make this week that aren't documented anywhere?"*

-   *"What did I even DO today? Where'd that time go?"*

-   *"What two things things this week seem unrelated but might actually connect?"*

All three answers were a kick in the pants. The third one was so spot-on, it made Tal uncomfortable.

How did Opus 4.6 know so much about us? Sure, it's a smart cookie that has [context on our work](https://www.lennysnewsletter.com/p/build-your-personal-ai-copilot), memory, and integrations. And now it has one more thing:

**Using Familiar, AI now watches our computer screens. All. The. Time.**

![](https://substackcdn.com/image/fetch/$s_!NbgA!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F451b1438-633b-4935-977d-6b4bc5942a15_1179x689.png)
(https://substackcdn.com/image/fetch/$s_!NbgA!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F451b1438-633b-4935-977d-6b4bc5942a15_1179x689.png)

## What is Familiar? 

Familiar is a desktop Mac app that takes everything that passes through your screen (and clipboard) and saves it as context for your existing AI (OpenClaw, Claude Cowork, Claude Code, Codex, Cursor, Antigravity, you name it).

**Familiar is free, open source, and offline.**

Familiar runs in the background from the moment you start your Mac.

You install it, and your AI just gets smarter. It runs quietly in the background from the moment you start your Mac. No habits to build, no interface to learn.

![](https://substackcdn.com/image/fetch/$s_!d1NR!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F0cdf9e5d-57e3-495d-91ac-ad64c81b0876_866x762.png)
(https://substackcdn.com/image/fetch/$s_!d1NR!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F0cdf9e5d-57e3-495d-91ac-ad64c81b0876_866x762.png)

## What can I do with it?

We finally have a partner who sees everything we see. Imagine asking your favorite AI agent:

-   *"I'm going on parental leave. Based on my last 3 months, what does my replacement need to know about each initiative?"*

-   *"I need to write my weekly status update and my brain is completely empty"*

-   *"Who am I not talking to enough?"*

-   *"What were the exact arguments for and against the decision we made about the pricing model? I need to brief my new director."*

-   *"I just had a breakthrough solving a problem. Reconstruct the exact sequence so I can document/communicate it."*

-   *"I've been bouncing between Slack threads and Google Docs for two hours and my brain is soup. What are the open threads I still need to respond to?"*

The answers are good, and they get better with every passing minute.

## How does it work?

1.  Familiar looks at your screen every few seconds and converts it to text using Apple's native OCR.

2.  It also saves everything that passes through your clipboard (this includes most third-party speech-to-text tools, too)

3.  All these text files go in a local folder of your choosing (we recommend placing `/familiar/` inside wherever you work with your AI agent)

That's it. We kept it simple. Just a menu bar icon, so you can pause or quit anytime.

![](https://substackcdn.com/image/fetch/$s_!Ndzy!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F6516e2f0-95fe-42a4-a5db-fdb5d72380a0_871x121.png)
(https://substackcdn.com/image/fetch/$s_!Ndzy!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F6516e2f0-95fe-42a4-a5db-fdb5d72380a0_871x121.png)

As you use your AI thinking partner, it can use that context to help you. (To make that smooth, Familiar can auto-add a *Skill*, a text file that tells your AI when and how to use your new folder.)

We've observed AI agents use Familiar as one more layer on top of tools, file system, skills, and the LLM's own knowledge. Context compounds: each source fills the blind spots of the others, and the AI starts connecting dots none of them could surface alone.

We're excited about screenshots. Screenshots have information that MCPs and APIs don't: behavior signal on where you spend your focus and attention. The Google documents and Slack threads where you linger speak volumes about what's important. *Where you spend your time is valuable context.*

Screenshots are also immune to SaaS companies anxiously walling off your data (not naming names).

And yes - OCRing screenshots is messy, often illegible to humans. LLMs are beautifully antifragile to messy input.

We stand on the shoulders of giants: Rewind, Recall, Dayflow, and others who watched your screen before us. We're especially grateful to Louis Beaumont, creator of Screenpipe, who met us in person and was super encouraging.

Familiar is unique in two ways:

1.  We're focused on one use case: raw context for your existing AI agents.

2.  Timing

## Why now?

The models are good enough.

The latest AI models are resourceful. You can give them a directory full of files, and watch them glide across stupidly large amounts of messy text with the simplest of tools. They're increasingly proactive in [managing their own context](https://www.talraviv.co/p/i-had-claude-code-stockpile-my-transcripts) with tactics like context editing and subagents. As a result, Familiar doesn't need to capture everything perfectly; it's just the starting clues for an agent.

![](https://substackcdn.com/image/fetch/$s_!zhBM!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F15bc0aa5-6611-43f5-9135-eb4f7f0942c6_1671x752.png)
(https://substackcdn.com/image/fetch/$s_!zhBM!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F15bc0aa5-6611-43f5-9135-eb4f7f0942c6_1671x752.png)

Something about AI has changed in recent weeks. When we watch our AI agents at work, we feel more like biologists than engineers. We spend more time humbled by complexity-bigger-than-our-brains, less time inspecting the gears of a clock.

We've stopped patronizing and coddling AI. These days we just give it all the context we have, get out of the way, and let it rise to the occasion.

In other words, the [Bitter Lesson](https://en.wikipedia.org/wiki/Bitter_lesson) has reached our use case. The answers aren't always perfect, but like everything with AI, we take the good and leave the bad. And the good is pretty damn good.

## This scares the crap out of me

It scares us, too. We're leaning into it.

A good time to introduce ourselves. We're [Tal Raviv](https://www.talraviv.co) and [Maxim Vovshin](https://il.linkedin.com/in/maxim-vovshin-a5a0a5164). Maxim is an early contributor to OpenClaw, ex-Orca Security, and ex-military intelligence (he's also Tal's second-cousin's-husband, which in a country of 10 million, could refer to 50% of the population).

We decided that for this crazy idea to work, it would have to be:

1.  free

2.  open source

3.  offline

As a result, Familiar is the security equivalent of "taking a screenshot and saving it to your hard drive." That's allowed even in windowless, underground rooms in the Pentagon.

From there, it's your LLM of choice. For sensitive work information, that should be the provider you have an enterprise contract with, or your company's internally hosted models.

## What if I Google something embarrassing?

You can pause or quit Familiar anytime. You can also directly go to the file and delete as much of the context as you want.

## Why did you build this?

We want this.

We're also not alone. We have the privilege of accessing hundreds of product people who are doing everything right when it comes to using AI. Yet in 1-1 conversations, they *all* hit the bottleneck of "keeping AI updated."

> *"I feel like a lot of what I do is getting the right context to feed into models right now. And currently, that's a lot of copying and pasting." - Product Manager*

> *"I've been desperately trying to figure out how to best automatically manage my AI's context (primarily from Google Docs, Jira, Figma for design files and my product scrapbook, and Granola for notes) without having to explicitly upload PDFs or call out specific file names proactively. I have not been able to crack it though." - Product Manager*

> *"The approach of 'use AI as your assistant with broad knowledge so it can do everything' just hasn't worked. I end up spending too much time trying to give it enough context to think like I would." - Product manager*

These people are incredibly AI-forward and hardworking. Some work hard to do this manually: dedicated time blocks, scrapbooking, and lots of copy and pasting. These people's time is rare and expensive, so that tells us how valuable that is.

Normal people can't afford to do that. Imagine how many could benefit if we made this slightly easier.

We want everyone to leverage their hard work---the thinking and writing scattered across their tools---with AI, no extra effort.

## Who might want this?

The answer today: AI-forward geeks like us who use AI locally (Claude Cowork, Cursor, Claude Code, Codex, OpenClaw etc).

Long term, we'll make this less geeky (local AI agents are just our starting point). We'll also bring it to teams and enterprises.

> *"I want peace of mind that my own self and my company are not operating with amnesia, and that they're constantly getting better at the fastest rate they possibly can." - Founder*

## Why is this free, open source, and offline?

We envision a world where every knowledge worker runs Familiar (or something like it). Getting there requires being free, open source, and offline.

We're inspired by Peter Steinberger, whose approach to OpenClaw showed us that "having nothing to lose" is a great strategy. We're building this because no responsible company in their right mind (e.g. with revenue and legal teams) would build this. (Maxim and I frequently answer each other with "WWPSD.")

We believe in [positive-sum games](https://youtu.be/tq6vdDJQXvs?si=qUkm64_yNoNsy8qK&t=4192). A world where every knowledge worker runs Familiar (or something like it) is a world with abundant opportunities.

## How can I get involved?

#### We're onboarding 30 alpha testers over the coming week

[It's up on GitHub](https://github.com/familiar-software/familiar), though we'd love 10 minutes to onboard you.

[Book 10 min with Maxim](https://calendar.app.google/pwXUTTDFx4n8XSxRA)

![](https://substackcdn.com/image/fetch/$s_!fnJg!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fa9b8ea15-fc07-403c-8cd4-d0a491e19608_4032x3024.jpeg)
(https://substackcdn.com/image/fetch/$s_!fnJg!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fa9b8ea15-fc07-403c-8cd4-d0a491e19608_4032x3024.jpeg)

You can't see it from this angle, but Maxim has a "WWPSD" neck tattoo.

Email us at `maxvovshin at gmail.com` and `talsraviv at gmail.com` Tell us you're interested, tell us we're nuts, tell us you want Windows, whatever's on your mind.

#### Join our open-source community

[The repository is here](https://github.com/familiar-software/familiar). Nothing makes nerds like us happier than a ⭐️ on Github.

## We can't imagine working without AI sitting over our shoulders, watching everything

We know that's a weird sentence, but AI needs wayyyyyy more context, and that context is so much bigger than our past chats or MCP integrations.

We're getting answers that would be impossible even for the highest-paid coach. No human can watch our screens all day, remember everything, and provide piercing answers on demand. For any amount of money.

With Familiar, AI can.


## Community-inspired use cases

## Predict

> Predict what is going to happen next week and tell me how to make it 10x more impactful.
_Credit: Juraj Mojik_

### Discover

> Given that you have been looking at my screen all the time, and what you know about me, what valuable questions might I ask you that make use of the fact that you've been looking at my screen and the information found there? 

Or less about meta-use cases, and just pure help: 
> Given that you have been looking at my screen all day, and what you know about me, what can you help me with?

> Based on the past week, what were the most crucial design choices that we took for <X>? look for opinionated design choices that influence the usability of the app. 

## Seeing connections

> What two things from this week seem unrelated but might actually connect? Based on what you've seen me do 

## Updates

> Write my weekly status update based on what I _actually did_ this week. 

## Relationships

> What's every interaction I've had with this person in the last month? What's the emotional arc? What did I promise? What did they promise?

> What do you see in my interactions with [person]?

> Who am I not talking to enough?

> Which people from my network have I not interacted with in 2+ weeks who I used to engage with regularly?

> What's everything I know about [company/person] based on what's crossed my screen?

## Knowledge transfer

> I'm going on parental leave. Based on my last 3 months of screen history, what does my replacement need to know about each initiative?

> What context does my engineering lead need from me that I keep having to repeat in meetings?

> What decisions did we make this week that aren't documented anywhere?

> I just had a breakthrough solving a problem. Reconstruct the exact sequence so I can document/communicate it.

## Productivity

> I've been bouncing between message threads and docs for two hours and my brain is soup. What are the open threads I still need to respond to?

> Given everything on my plate right now, what would you cut and in what order?

> What's on my to-dos that I haven't even looked at in a week?

> Am I operating as fast as I could be?

> What did I just do for like the last 10 minutes? Where'd that time go?

> What did I friggin do today? Would you say I was effective? 

> What's the thing I keep circling back to but never finishing?

> Where does my deep work actually happen, and what kills it?

## Focus

> What did I commit to that I've forgotten based on what you've seen me do?

> Am I in the right track? Am I focusing on the right things given my goals and strategy?

> Are there any shadow initiatives or threads or goals I'm working on that I should make explicit

## Emerging patterns

> What's emerging? What am I doing more of this week compared to last week?

> What's new in my world this week that wasn't there before?

> When I'm procrastinating, what do I gravitate toward? What does that say about what I actually enjoy?

## Recall

> I was in back-to-back meetings all day. What did I commit to across all of them?

> The retention number I saw on the dashboard Tuesday is different from what they're presenting right now. I know it. Show me what I saw.

> The VP just asked "didn't we already decide this?" and I KNOW we did. I saw it somewhere -- Slack, a doc, maybe a comment in Jira. But I can't find it in any of those tools. Where was it?

> What did I do instinctively that someone less experienced would need spelled out?

> I saw something about X a few days ago, I think in a chat or maybe a webpage. Find it.

> What was the exact wording someone used when they said that thing about [topic]?

> Before my call with Z next week, show me everything I've seen or read about them recently.

> I forgot to take a screenshot during a webinar I was running last night. Just ask Familiar to find it so I can share it.
_Credit: Sumant Subrahmanya_

## Installation: use GitHub Releases

1. Open the releases page: `https://github.com/familiar-software/familiar/releases`
2. Download the latest `.dmg`:
   - `arm64` for Apple Silicon Macs (M1/M2/M3/M4)
   - `x64` for Intel Macs
3. Open the installer and move `Familiar.app` to `Applications`.
4. Launch Familiar and complete setup in Settings.

## Where Familiar writes data

- Settings: `~/.familiar/settings.json`
- Captured still images: `<contextFolderPath>/familiar/stills/`
- Extracted markdown and mirrored clipboard context: `<contextFolderPath>/familiar/stills-markdown/`

## Build locally (advanced)

If you prefer to run from source:

```bash
git clone https://github.com/familiar-software/familiar.git
cd familiar/code/desktopapp
npm install
npm start
```

Create local macOS build artifacts:

```bash
npm run dist:mac
```

## Contribution

For development contributions:

```bash
npm test
npm run test:unit:timed
npm run test:modelProviderTests
npm run test:e2e
```

Open a PR with a clear description, tests for behavior changes, and any relevant README/docs updates.
