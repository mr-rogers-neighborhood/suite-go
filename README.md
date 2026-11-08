# Suite Go

**One mobile app for the Suite domains.** A container that opens one domain at a time, hands it a
document, and stays out of its way.

> **v0: the shell only.** No domains ship in this build. What exists is the module contract, the home
> surface, and one throwaway module that exists to prove the contract works. That is deliberate: a
> container that has never hosted anything is a drawing, not a design.

## Why one app

The suite is three domains and a hub, and on a desktop that separation is worth paying for: separate
windows, separate files, separate update feeds. On a phone it is not. Three app store listings, three
signing pipelines, three onboarding flows and three ways to be confused about which app holds what is
a tax paid three times for a separation a phone does not need.

The thing to guard against is not the single binary, it is the single _screen_: one dashboard showing
tasks and budget envelopes together because they happen to live in the same process. So the container
keeps the domain boundaries exactly as hard as they are on the desktop. It knows how to launch a
module, hand it a document handle, and nothing else.

## Two rules

1. **The container never reads a document.** It carries bytes and a name. `.planner`, `.budget` and
   `.canvas` are shapes their own apps own.
2. **The container never learns a domain.** It routes on what a module _declares_. There is no
   `if (module.id === "planner")` anywhere in `apps/go`, and there should never be one.

## What exists

| Area                 | State                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `@suite/go` contract | Module declarations, capability routing, capture intents, host services, teardown isolation |
| Shell                | Home surface: capture bar, pinned domains, recents; honest empty states                     |
| Domain modules       | None. One reference module (Scratch) proves mount, document handoff and teardown            |
| Android              | Debug APK installs and launches on a physical device over USB                               |
| iOS                  | Wired by convention, unbuilt — Xcode needs macOS                                            |
| Sync                 | Seam designed, no transport. `ModuleHost` is where it will arrive                           |

## Run it

```sh
pnpm install
pnpm doctor              # what is present, what is missing, what to run
pnpm android:install     # build, install and launch on the attached phone
pnpm android:watch       # the same, again, on every save
pnpm android:emulator --start suite-go-atd
pnpm android:eval "document.body.innerText"   # ask the running app a question
pnpm android:ax --assert                      # fail on an unnamed control
pnpm check               # lint, types, tests
```

`pnpm android:eval` is how a device gets asserted on. WebView content is invisible to
`uiautomator` and screenshot diffing only guesses, so the container's own state is read back over
DevTools: `pnpm android:eval "localStorage.getItem('suite-go:shell:list')"`.

`pnpm doctor` exists because the failure modes here are unhelpful: a phone that is attached but
unauthorised looks exactly like one that is not attached, and Gradle reports a missing SDK component
in a stack trace whose useful sentence is twenty lines in.

## Packages

| Path          | Owns                                                       | Does not own                                     |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `packages/go` | Module declarations, routing, host interfaces, teardown    | Any domain schema, any I/O, any React at runtime |
| `apps/go`     | The shell: home, capture resolution, document store, theme | What any document means                          |

See [the contract](docs/reference/contract.md) for what a module may do, and
[adding a domain](docs/how-to/add-a-domain.md) for how little the container needs to change.

---

Developer note:

**What is Suite?**

Suite is a collection of applications, a relay for sync and collaboration, and a toolbox for updating and managing your applications.

This architecture came from trying basically every application worth trying in its respective space and being left wanting. I can't claim to have replaced these applications, but I'm building my own that provide the feature sets I need. They're released open-source under the MIT license, local-first, and easy to install and manage from your own computer. Mobile applications are out of scope for now, but will come once there's a solid foundation. If these applications are useful to you, you're free to use them however you'd like, or fork and develop them into your own suite.

Applications I've tested in the past include knowledge management tools and outliners such as Obsidian, Notion, Capacities, Heptabase, Tana, Logseq, and AnyType. They also include planners and task management tools such as Sunsama, Akiflow, Todoist, and TickTick, as well as budgeting applications such as YNAB and Actual.

Each of these has something going for it that the others don't, and every one is missing a critical set of capabilities I'd want from that kind of application: a simple, local-first, integrated sync service, and flexible, deep collaboration features. Some are free and open-source, even local-first; others are tied entirely to the cloud and an internet connection. None contain the exact set of capabilities I want for a visual note-taking and research application.

That led to Suite Canvas, originally the only application in the collection. Suite Canvas combines the typed-object-graph model from apps like Capacities with the canvas-driven, research-oriented experience of Heptabase. It takes smaller influences from other applications on the list, and from some that aren't (such as a generalized version of Tana's Supertags). It's the most mature of the bunch, though still very much in alpha.

I've tried to build something like Canvas several times, and each attempt hit scope creep or a design wall that led me to abandon or restart it. Approaches that didn't work out:

- **Canvas as a CMS.** A tool for thinking always becomes constrained by the language and thought process of web design. People don't think in routes or views, and mashing the two languages together produced something confusing and not worth using. Adding mapping between the CMS and the canvas didn't help either (I carried over, and still maintain, many architectural ideas from WordPress plugins like Advanced Custom Fields, Metabox, and Pods). It was clunky and felt like using two separate applications that don't mix.
- **Infinite canvas.** It seems ideal, and I love the infinite-zoom drawings people make. I tried ICE, an experimental canvas engine, and PixiJS. Both looked striking and had genuinely impressive features (ICE let you arrange cards fractally, for example), but they were complexity tar pits that forced the entire application design to contort around them. That's before getting into accessibility, sync and collaboration, and also navigation: it predictably makes it very easy to get lost. Good for art, not clear that it is good for a structured thinking tool. I did end up integrating excalidraw, via the "Sketch" card type and embed, so you maintain the important bit of being able to draw and sketch on an infinite canvas, and then embed it in your non-infinite canvas. I also added the "Portal" card type, a way to link from one canvas board to another. These were more comprehensive and easily justified expansions.
- **No-code/low-code systems and computational notebook features.** These seem ideal too, but they cause both classes of problems above and worse ones. You lose the ability to arbitrarily rearrange your thoughts, because your links and cards now mean something beyond simple data. The result can be as striking as an infinite canavas (I even had links animate to show you the data-flow directly), but in my attempts it wasn't useful, just looked cool.

None of these experiments were pointless. Each revealed insights I didn't have before and taught me something about software design.

Suite Planner, Suite Budget, and the surrounding tooling (Suite Start and Suite Sync) came from realizing I can't fit all of these application types onto a canvas interface. I tried, and hit the the third design wall mentioned above. It was too complex, too deep, and too over-engineered to be functional and usable, let alone shippable.

So the applications are split into three that match their domains. A canvas is a thinking and research tool. A planner is a task, project management, and calendaring tool. A budget is a budgeting tool. I plan to experiment with integrations (embedding your calendar or budget into your canvas, or attaching your canvas to your calendar or budget, for example), but those features need to be considered deeply to actually be useful.

In the end, you should have a canvas, a planner, and a budget: all simple and easy to use, all with integrated and easy-to-run sync and update services, and none of them requiring you to connect to a centralized server or cloud service to use, at all. That's what will make Suite pretty sweet.
