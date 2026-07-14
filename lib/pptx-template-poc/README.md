# Isolated PPTX template parser POC

This module reads the OOXML package inside an existing `.pptx` and emits a
deterministic `teacher-pptx-template-manifest/v1` JSON document. It extracts
slide size, theme colors/fonts, master-layout relationships, placeholders and
embedded media with checksums and relationship owners.

The module is isolated: it does not write Prisma records, select teacher
templates, mutate courseware versions, or participate in export. A future
adapter may map a reviewed manifest into `teacher-template-registry`.

`toRuntimeTemplateProfile()` is the explicit product integration boundary. The
isolated `POST /api/teacher-template-manifest` endpoint returns both contracts
and declares that nothing was persisted and no registry/version was mutated.

## Provenance and license boundary

This is original OOXML parsing code written for this repository. PPT Master's
public docs and MIT-licensed repository informed the capability checklist, but
no PPT Master source code was copied. Sources:
https://github.com/hugohe3/ppt-master and
https://github.com/hugohe3/ppt-master/blob/main/LICENSE.

OOXML ZIP reading uses JSZip 3.10.1 (MIT). Fixture generation uses the existing
PptxGenJS 4.0.1 dependency (MIT).

## Run

```powershell
npm run teacher-template-poc:test
node --experimental-strip-types scripts/pptx-template-manifest-poc.ts input.pptx output.json
```

The POC does not parse legacy binary `.ppt`, encrypted packages, macros, OLE
objects, or resolve inherited geometry across the complete master-layout-slide
cascade.
