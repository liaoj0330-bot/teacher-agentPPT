# Third-party notices

## presentation-skill

The visual compiler text-measurement and layout-QA approach was adapted from
[`siril9/presentation-skill`](https://github.com/siril9/presentation-skill),
licensed under the MIT License. The implementation in this repository is
rewritten against the local `RenderScene` and `LayoutContract` interfaces; no
templates, slide assets, workspace state machine, or bundled presentation files
are copied.

## ppt-agent-skills

The page-level Gate semantics (pass, review, retry-current-page), dual planning
and visual assertions, and isolated page rollback approach were adapted from
[`sunbigfly/ppt-agent-skills`](https://github.com/sunbigfly/ppt-agent-skills),
licensed under the MIT License. They are implemented through the existing
`TeacherDeckPlan` reducer and local visual compiler. The upstream multi-agent
orchestrator, HTML templates, PNG/SVG exporters, prompts, and state machine are
not bundled or used at runtime.
