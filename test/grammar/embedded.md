%% SYNTAX TEST "text.html.markdown" "CQL fenced code blocks in Markdown"

```logscale
#event_simpleName=ProcessRollup2 | x := 1
%%  <----------------- entity.name.tag.cql
%%                               ^ keyword.control.pipe.cql
```

```cql
user=admin
%%  <---- variable.other.property.cql
```

```NGSIEM title="case-insensitive language tag"
foo=bar
%%  <--- meta.embedded.block.crowdstrike-cql
```

```sql
user=admin
%%  <---- - variable.other.property.cql
```
