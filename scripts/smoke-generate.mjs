import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "outputs");
fs.mkdirSync(outDir, { recursive: true });

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${url} ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function exportPptx(project, fileName) {
  const response = await fetch("http://localhost:3002/api/export-pptx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project })
  });
  if (!response.ok) {
    throw new Error(`export failed ${response.status}: ${await response.text()}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const output = path.join(outDir, fileName);
  fs.writeFileSync(output, buffer);
  return { output, size: buffer.length };
}

async function uploadTextFixture() {
  const fixture = [
    "杭州一日游需求文档",
    "",
    "第1页：封面，标题为杭州一日游精华攻略，强调西湖主线、城市步行、茶文化和夜游备选。",
    "第2页：行程总览，上午断桥、白堤、平湖秋月；中午湖滨或龙翔桥用餐；下午苏堤、花港观鱼、雷峰塔；傍晚河坊街。",
    "第3页：西湖主线，说明步行节奏、拍照节点、避开拥堵的时间建议。",
    "第4页：灵隐寺与龙井村二选一，说明人群差异、交通成本和时间取舍。",
    "第5页：交通策略，地铁到龙翔桥或凤起路，景区内以步行为主，热门时段不要临时打车。",
    "第6页：美食与休息，杭帮菜、片儿川、葱包烩、茶点咖啡，不为单一餐厅跨区排队。",
    "第7页：预算区间，门票、餐饮、交通、机动费用分开估算。",
    "第8页：避坑清单，预约、天气、步行量、返程时间都要提前确认。"
  ].join("\n");
  const blob = new Blob([fixture], { type: "text/plain;charset=utf-8" });
  const form = new FormData();
  form.append("file", blob, "杭州一日游需求文档.txt");
  const response = await fetch("http://localhost:3002/api/upload-ppt", { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(`upload failed ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function main() {
  const prompt = "帮我做一份杭州一日游攻略 PPT，围绕西湖、灵隐寺、龙井村和河坊街，包含路线、交通、美食、预算和预约避坑，要求真实资料源、10页左右、版式不要统一模板。";
  const search = await postJson("http://localhost:3002/api/search-materials", {
    queries: ["杭州 一日游 西湖 灵隐寺 龙井 河坊街 官方 交通 预约", "杭州 西湖 景区 游览提示 官方"]
  });
  console.log("search provider:", search.groups?.map((group) => group.provider).join(","));

  const generated = await postJson("http://localhost:3002/api/generate-ppt", {
    prompt,
    mode: "agent",
    researchSources: search.groups
  });
  console.log("generated:", generated.provider, generated.project?.slides?.length, generated.project?.title);
  console.log("layouts:", generated.project?.slides?.map((slide) => slide.layout).join(","));
  const exported = await exportPptx(generated.project, "hangzhou-1day-layout-v4.pptx");
  console.log("exported:", exported.output, exported.size);

  const uploaded = await uploadTextFixture();
  console.log("uploaded:", uploaded.fileName, uploaded.analysis?.pageCount, uploaded.analysis?.blockCount);
  const docGenerated = await postJson("http://localhost:3002/api/generate-ppt", {
    prompt: "请严格基于上传的杭州一日游需求文档生成 PPT，按页面要求复刻内容，并保留 evidenceBlockIds。",
    mode: "reference",
    uploadedFile: {
      name: uploaded.fileName,
      size: uploaded.size,
      type: uploaded.type,
      analysis: uploaded.analysis
    },
    researchSources: search.groups
  });
  console.log("doc generated:", docGenerated.provider, docGenerated.project?.slides?.length, docGenerated.project?.title);
  console.log("doc evidence:", docGenerated.project?.slides?.filter((slide) => slide.evidenceBlockIds?.length).length);
  const docExported = await exportPptx(docGenerated.project, "hangzhou-doc-driven-layout-v1.pptx");
  console.log("doc exported:", docExported.output, docExported.size);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
