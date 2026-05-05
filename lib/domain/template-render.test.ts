import { describe, expect, it } from "vitest";
import { renderTemplate } from "./template-render";

describe("renderTemplate", () => {
  it("substitutes a single variable", () => {
    expect(renderTemplate("Hello {{name}}", { name: "Joe" })).toBe("Hello Joe");
  });

  it("substitutes multiple instances of the same variable", () => {
    expect(
      renderTemplate("{{name}} called {{name}} again", { name: "Joe" }),
    ).toBe("Joe called Joe again");
  });

  it("HTML-escapes special characters in substituted values", () => {
    expect(
      renderTemplate("<title>{{n}}</title>", { n: "<script>alert('x')</script>" }),
    ).toBe("<title>&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;</title>");
  });

  it("substitutes a missing variable as empty string", () => {
    expect(renderTemplate("a={{a}} b={{b}}", { a: "x" })).toBe("a=x b=");
  });

  it("includes a conditional block when the value is present", () => {
    const out = renderTemplate(
      "{{?rating}}<span>{{rating}}★</span>{{/rating}}",
      { rating: 4.7 },
    );
    expect(out).toBe("<span>4.7★</span>");
  });

  it("strips a conditional block when the value is undefined", () => {
    expect(
      renderTemplate(
        "before{{?rating}}<span>{{rating}}★</span>{{/rating}}after",
        {},
      ),
    ).toBe("beforeafter");
  });

  it("strips a conditional block when the value is null or empty string", () => {
    expect(renderTemplate("a{{?x}}<i>{{x}}</i>{{/x}}b", { x: null })).toBe("ab");
    expect(renderTemplate("a{{?x}}<i>{{x}}</i>{{/x}}b", { x: "" })).toBe("ab");
  });

  it("handles numeric values without losing them through stringification", () => {
    expect(renderTemplate("{{n}}", { n: 0 })).toBe("0");
    expect(renderTemplate("{{n}}", { n: 1000 })).toBe("1000");
  });

  it("handles multiple conditional blocks for the same key", () => {
    const tpl = "{{?phone}}A:{{phone}}{{/phone}} mid {{?phone}}B:{{phone}}{{/phone}}";
    expect(renderTemplate(tpl, { phone: "01942" })).toBe("A:01942 mid B:01942");
    expect(renderTemplate(tpl, {})).toBe(" mid ");
  });

  it("preserves whitespace and HTML structure", () => {
    const tpl = "<div>\n  <p>{{name}}</p>\n</div>";
    expect(renderTemplate(tpl, { name: "Joe" })).toBe("<div>\n  <p>Joe</p>\n</div>");
  });
});
