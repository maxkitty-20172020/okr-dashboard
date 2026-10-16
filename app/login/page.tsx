import { LoginForm } from "@/components/login-form";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  return <main className="login-page"><section className="surface login-card"><div className="brand"><span className="brand-icon" aria-hidden="true">运</span><strong>运营部看板</strong></div><h1>登录</h1><p className="section-help">记录进展，持续跟进重要的事。</p><LoginForm /></section></main>;
}
