package com.pressflow;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
class AuthController {
    private final AuthenticationManager manager;
    private final SecurityContextRepository contexts;
    private final HttpSessionCsrfTokenRepository csrf;
    AuthController(AuthenticationManager manager, SecurityContextRepository contexts, HttpSessionCsrfTokenRepository csrf) {
        this.manager = manager; this.contexts = contexts; this.csrf = csrf;
    }
    record Login(@NotBlank @Size(max=100) String username, @NotBlank @Size(max=200) String password) {}
    private Map<String, Object> session(Authentication auth, String token) {
        boolean signedIn = auth != null && auth.isAuthenticated() && !"anonymousUser".equals(auth.getPrincipal());
        Map<String,Object> result = new LinkedHashMap<>();
        result.put("authenticated", signedIn); result.put("csrfToken", token);
        result.put("user", signedIn ? Map.of("username", auth.getName(), "displayName", "Studio operator") : null);
        return result;
    }
    @GetMapping("/session") Map<String,Object> current(Authentication auth, CsrfToken token) { return session(auth, token.getToken()); }
    @PostMapping("/login") Map<String,Object> login(@Valid @RequestBody Login login, HttpServletRequest request, HttpServletResponse response) {
        try {
            Authentication auth = manager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(login.username(), login.password()));
            request.getSession(true); request.changeSessionId();
            var context = SecurityContextHolder.createEmptyContext(); context.setAuthentication(auth);
            SecurityContextHolder.setContext(context); contexts.saveContext(context, request, response);
            csrf.saveToken(null, request, response);
            CsrfToken token = csrf.generateToken(request); csrf.saveToken(token, request, response);
            return session(auth, token.getToken());
        } catch (AuthenticationException ex) { throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid username or password."); }
    }
    @PostMapping("/logout") Map<String,Object> logout(HttpServletRequest request, HttpServletResponse response) {
        var previous = request.getSession(false); if (previous != null) previous.invalidate();
        SecurityContextHolder.clearContext();
        CsrfToken token = csrf.generateToken(request); csrf.saveToken(token, request, response);
        return session(null, token.getToken());
    }
}
