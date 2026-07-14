const fixture = [
  "杭州一日游需求文档",
  "",
  "第1页：封面，标题为杭州一日游精华攻略，强调西湖主线、城市步行、茶文化和夜游备选。",
  "第2页：行程总览，上午断桥、白堤、平湖秋月；中午湖滨或龙翔桥用餐；下午苏堤、花港观鱼、雷峰塔；傍晚河坊街。"
].join("\n");

const blob = new Blob([fixture], { type: "text/plain;charset=utf-8" });
const form = new FormData();
form.append("file", blob, "hangzhou-requirements.txt");
const response = await fetch("http://localhost:3002/api/upload-ppt", { method: "POST", body: form });
const json = await response.json();
console.log(JSON.stringify(
  {
    fileName: json.fileName,
    status: json.status,
    summary: json.analysis?.summary,
    blocks: json.analysis?.blocks?.slice(0, 4)
  },
  null,
  2
));
