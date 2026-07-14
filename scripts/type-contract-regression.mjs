const BASE_URL = process.env.TYPE_CONTRACT_BASE_URL || "http://127.0.0.1:3002";

const cases = [
  {
    id: "project-report-edu-platform",
    prompt: "帮我做一份 AI 数字产教融合平台项目汇报 PPT，面向高校领导，要求政务、清晰、可落地，必须包含政策依据、平台架构、三端功能、验收标准和推进计划。",
    reviewType: "project_report",
    planType: "project_report",
    roles: ["背景依据", "实施计划", "验收成效", "行动收束"]
  },
  {
    id: "policy-report",
    prompt: "帮我做一份政策汇报 PPT，面向主管部门，解读最新产业政策要求，并说明我单位的落实任务、责任分工、成效复盘和下一步工作。",
    reviewType: "policy_report",
    planType: "policy_interpretation",
    roles: ["政策依据", "落实任务", "责任机制", "成效复盘"]
  },
  {
    id: "product-intro",
    prompt: "帮我做一份 Dify 产品介绍 PPT，面向企业客户和技术负责人，讲清产品定位、核心能力、产品蓝图、使用路径、部署方式和采购判断。",
    reviewType: "product_proposal",
    planType: "product_intro",
    roles: ["产品定位", "产品蓝图", "使用路径", "部署集成"]
  },
  {
    id: "service-proposal",
    prompt: "帮我做一份企业 AI 培训服务合作方案 PPT，面向甲方采购方，说明客户痛点、服务内容、实施周期、交付成果、报价逻辑、风险控制和合作动作。",
    reviewType: "product_proposal",
    planType: "proposal",
    roles: ["客户问题", "交付成果", "实施周期", "合作动作"]
  },
  {
    id: "financial-analysis",
    prompt: "帮我做一份小米 2025 Q3 季度财报分析 PPT，面向管理层，说明营收、利润、现金流、同比环比、风险因素和管理建议。",
    reviewType: "financial_analysis",
    planType: "financial_report",
    roles: ["核心结论", "指标总览", "收入结构", "风险因素"]
  },
  {
    id: "travel-guide",
    prompt: "帮我做一份北京一日游攻略 PPT，面向第一次来北京的自由行游客，要有分时段路线、预约规则、交通、预算、避坑和天气备选。",
    reviewType: "travel_guide",
    planType: "travel_plan",
    roles: ["路线总览", "每日路线", "交通安排", "风险备选"]
  }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includesAny(text, needle) {
  return text.includes(needle);
}

async function postJson(pathname, body) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${pathname} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

const results = [];
for (const item of cases) {
  const data = await postJson("/api/type-detect", { prompt: item.prompt });
  const roleText = data.requiredPageRoles.map((role) => `${role.role} ${role.titleIntent} ${role.mustProve}`).join("\n");
  assert(data.reviewType === item.reviewType, `${item.id}: expected reviewType ${item.reviewType}, got ${data.reviewType}`);
  assert(data.planType === item.planType, `${item.id}: expected planType ${item.planType}, got ${data.planType}`);
  item.roles.forEach((role) => {
    assert(includesAny(roleText, role), `${item.id}: missing required role keyword ${role}`);
  });
  results.push({
    id: item.id,
    reviewType: data.reviewType,
    planType: data.planType,
    confidence: data.confidence,
    roleCount: data.requiredPageRoles.length
  });
}

console.log(JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), results }, null, 2));
