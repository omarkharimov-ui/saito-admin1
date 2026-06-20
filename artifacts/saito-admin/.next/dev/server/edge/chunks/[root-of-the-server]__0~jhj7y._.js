(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["chunks/[root-of-the-server]__0~jhj7y._.js",
"[externals]/node:buffer [external] (node:buffer, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:buffer", () => require("node:buffer"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[project]/.accio/accounts/1770834361/agents/DID-F456DA-49F456DAU1781988-6520-EAC5B8/project/saito-admin1/artifacts/saito-admin/middleware.ts [middleware-edge] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "config",
    ()=>config,
    "middleware",
    ()=>middleware
]);
var __TURBOPACK__imported__module__$5b$project$5d2f2e$accio$2f$accounts$2f$1770834361$2f$agents$2f$DID$2d$F456DA$2d$49F456DAU1781988$2d$6520$2d$EAC5B8$2f$project$2f$saito$2d$admin1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$api$2f$server$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/.accio/accounts/1770834361/agents/DID-F456DA-49F456DAU1781988-6520-EAC5B8/project/saito-admin1/node_modules/next/dist/esm/api/server.js [middleware-edge] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f2e$accio$2f$accounts$2f$1770834361$2f$agents$2f$DID$2d$F456DA$2d$49F456DAU1781988$2d$6520$2d$EAC5B8$2f$project$2f$saito$2d$admin1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$spec$2d$extension$2f$response$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/.accio/accounts/1770834361/agents/DID-F456DA-49F456DAU1781988-6520-EAC5B8/project/saito-admin1/node_modules/next/dist/esm/server/web/spec-extension/response.js [middleware-edge] (ecmascript)");
;
const ADMIN_ROLES = new Set([
    'admin',
    'superadmin'
]);
async function middleware(request) {
    const { pathname } = request.nextUrl;
    const role = request.cookies.get('saito_role')?.value;
    const isLoggedIn = request.cookies.get('isLoggedIn')?.value === 'true';
    // ── Skip auth for login and static files ──────────────────
    if (pathname.startsWith('/login') || pathname.startsWith('/api/auth') || pathname.includes('.')) {
        return __TURBOPACK__imported__module__$5b$project$5d2f2e$accio$2f$accounts$2f$1770834361$2f$agents$2f$DID$2d$F456DA$2d$49F456DAU1781988$2d$6520$2d$EAC5B8$2f$project$2f$saito$2d$admin1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$spec$2d$extension$2f$response$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next();
    }
    // ── Admin routes ──────────────────────────────────────────
    if (pathname.startsWith('/admin')) {
        if (!isLoggedIn || !role || !ADMIN_ROLES.has(role)) {
            const loginUrl = new URL('/login', request.url);
            loginUrl.searchParams.set('redirect', pathname);
            return __TURBOPACK__imported__module__$5b$project$5d2f2e$accio$2f$accounts$2f$1770834361$2f$agents$2f$DID$2d$F456DA$2d$49F456DAU1781988$2d$6520$2d$EAC5B8$2f$project$2f$saito$2d$admin1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$spec$2d$extension$2f$response$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(loginUrl);
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f2e$accio$2f$accounts$2f$1770834361$2f$agents$2f$DID$2d$F456DA$2d$49F456DAU1781988$2d$6520$2d$EAC5B8$2f$project$2f$saito$2d$admin1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$spec$2d$extension$2f$response$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next();
    }
    // ── Kitchen route ────────────────────────────────────────
    if (pathname.startsWith('/kitchen')) {
        if (!isLoggedIn || !role) {
            return __TURBOPACK__imported__module__$5b$project$5d2f2e$accio$2f$accounts$2f$1770834361$2f$agents$2f$DID$2d$F456DA$2d$49F456DAU1781988$2d$6520$2d$EAC5B8$2f$project$2f$saito$2d$admin1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$spec$2d$extension$2f$response$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/login', request.url));
        }
        if (role !== 'kitchen' && !ADMIN_ROLES.has(role)) {
            return __TURBOPACK__imported__module__$5b$project$5d2f2e$accio$2f$accounts$2f$1770834361$2f$agents$2f$DID$2d$F456DA$2d$49F456DAU1781988$2d$6520$2d$EAC5B8$2f$project$2f$saito$2d$admin1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$spec$2d$extension$2f$response$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/admin', request.url));
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f2e$accio$2f$accounts$2f$1770834361$2f$agents$2f$DID$2d$F456DA$2d$49F456DAU1781988$2d$6520$2d$EAC5B8$2f$project$2f$saito$2d$admin1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$spec$2d$extension$2f$response$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next();
    }
    // ── Root redirection ────────────────────────────────────
    if (pathname === '/' || pathname === '/admin') {
        if (isLoggedIn && role && ADMIN_ROLES.has(role)) {
            if (pathname === '/admin') return __TURBOPACK__imported__module__$5b$project$5d2f2e$accio$2f$accounts$2f$1770834361$2f$agents$2f$DID$2d$F456DA$2d$49F456DAU1781988$2d$6520$2d$EAC5B8$2f$project$2f$saito$2d$admin1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$spec$2d$extension$2f$response$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next();
            return __TURBOPACK__imported__module__$5b$project$5d2f2e$accio$2f$accounts$2f$1770834361$2f$agents$2f$DID$2d$F456DA$2d$49F456DAU1781988$2d$6520$2d$EAC5B8$2f$project$2f$saito$2d$admin1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$spec$2d$extension$2f$response$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/admin', request.url));
        }
        if (!isLoggedIn) {
            return __TURBOPACK__imported__module__$5b$project$5d2f2e$accio$2f$accounts$2f$1770834361$2f$agents$2f$DID$2d$F456DA$2d$49F456DAU1781988$2d$6520$2d$EAC5B8$2f$project$2f$saito$2d$admin1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$spec$2d$extension$2f$response$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL('/login', request.url));
        }
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f2e$accio$2f$accounts$2f$1770834361$2f$agents$2f$DID$2d$F456DA$2d$49F456DAU1781988$2d$6520$2d$EAC5B8$2f$project$2f$saito$2d$admin1$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$spec$2d$extension$2f$response$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next();
}
const config = {
    matcher: [
        '/',
        '/admin/:path*',
        '/kitchen/:path*'
    ]
};
}),
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__0~jhj7y._.js.map