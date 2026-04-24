import fs from "fs";

function safeRead(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

function extractFieldBlock(content, label) {
  const match = content.match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?:\\r?\\n\\r?\\n|$)`));
  return match ? match[1].trim() : "";
}

function extractSingleValue(content, label) {
  return extractFieldBlock(content, label)
    .split(/\r?\n/)[0]
    .trim();
}

function extractList(content, label) {
  return extractFieldBlock(content, label)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^-\s+/.test(line))
    .map(line => line.replace(/^-\s+/, "").trim())
    .filter(Boolean);
}

export function loadProductRequirements(paths) {
  const productStandards = safeRead(paths.productStandardsMd);
  const uiPatterns = safeRead(paths.uiPatternsMd);
  const designTokens = fs.existsSync(paths.designTokensJson)
    ? JSON.parse(fs.readFileSync(paths.designTokensJson, "utf-8"))
    : {};

  return {
    product_standards: {
      quality_level: extractSingleValue(productStandards, "Product quality level") || "standard_passing",
      target_audience: extractSingleValue(productStandards, "Target audience"),
      interaction_priority: extractSingleValue(productStandards, "Interaction priority"),
      accessibility_baseline: extractSingleValue(productStandards, "Accessibility baseline"),
      preferred_tone: extractSingleValue(productStandards, "Preferred product tone"),
      visual_direction: extractSingleValue(productStandards, "Visual direction"),
      color_direction: extractSingleValue(productStandards, "Color direction"),
      ui_density: extractSingleValue(productStandards, "UI density"),
      interaction_notes: extractSingleValue(productStandards, "Interaction notes"),
      avoid: extractList(productStandards, "Things the UI should avoid"),
      styling_contract: {
        mode: extractSingleValue(productStandards, "Styling contract mode") || "class_hook_surfaces",
        styling_hooks: extractSingleValue(productStandards, "Styling hooks") || "className required on user-facing layout surfaces",
        token_usage_mode: extractSingleValue(productStandards, "Token usage mode") || "shared_css_variables",
        inline_styles: extractSingleValue(productStandards, "Inline styles") || "forbidden",
        local_token_objects: extractSingleValue(productStandards, "Local token objects") || "forbidden",
        hardcoded_colors: extractSingleValue(productStandards, "Hardcoded colors") || "forbidden",
      },
      visual_character: {
        style: extractSingleValue(productStandards, "visual style should feel"),
        density: extractSingleValue(productStandards, "density should feel"),
        motion: extractSingleValue(productStandards, "motion should feel"),
        hierarchy: extractSingleValue(productStandards, "visual hierarchy should feel"),
      },
    },
    ui_patterns: {
      navigation_style: extractSingleValue(uiPatterns, "Navigation style"),
      button_hierarchy: extractSingleValue(uiPatterns, "Preferred button hierarchy"),
      feedback_style: extractSingleValue(uiPatterns, "Preferred feedback style"),
      form_style: extractSingleValue(uiPatterns, "Form style"),
      touch_expectations: extractSingleValue(uiPatterns, "Touch behavior expectations"),
      component_families: extractList(uiPatterns, "Component families that should feel consistent"),
      reuse_rules: [
        "prefer existing components over raw tag duplication",
        "layout files should compose child components",
      ],
    },
    design_tokens: designTokens,
  };
}
