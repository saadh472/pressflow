package com.pressflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

@Configuration
class SecurityConfig {
    @Bean BCryptPasswordEncoder encoder() { return new BCryptPasswordEncoder(); }
    @Bean InMemoryUserDetailsManager users(@Value("${pressflow.username}") String username,
            @Value("${pressflow.password}") String password, BCryptPasswordEncoder encoder) {
        if (username.isBlank() || password.length() < 10) throw new IllegalArgumentException("Set a username and a password of at least 10 characters.");
        return new InMemoryUserDetailsManager(User.withUsername(username).password(encoder.encode(password)).roles("OPERATOR").build());
    }
    @Bean AuthenticationManager authenticationManager(InMemoryUserDetailsManager users, BCryptPasswordEncoder encoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(users);
        provider.setPasswordEncoder(encoder);
        return new ProviderManager(provider);
    }
    @Bean SecurityContextRepository contextRepository() { return new HttpSessionSecurityContextRepository(); }
    @Bean HttpSessionCsrfTokenRepository csrfRepository() {
        HttpSessionCsrfTokenRepository repository = new HttpSessionCsrfTokenRepository();
        repository.setHeaderName("X-CSRF-TOKEN");
        return repository;
    }
    @Bean SecurityFilterChain security(HttpSecurity http, SecurityContextRepository context,
            HttpSessionCsrfTokenRepository csrf, ObjectMapper mapper) throws Exception {
        http.securityContext(config -> config.securityContextRepository(context))
            .csrf(config -> config.csrfTokenRepository(csrf).csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/session", "/api/login", "/api/health", "/error").permitAll()
                .requestMatchers("/api/**").authenticated().anyRequest().permitAll())
            .exceptionHandling(errors -> errors
                .authenticationEntryPoint((request, response, exception) -> {
                    response.setStatus(HttpStatus.UNAUTHORIZED.value()); response.setContentType("application/json");
                    mapper.writeValue(response.getOutputStream(), Map.of("message", "Sign in to continue."));
                }).accessDeniedHandler((request, response, exception) -> {
                    response.setStatus(403); response.setContentType("application/json");
                    mapper.writeValue(response.getOutputStream(), Map.of("message", "Your security token expired. Refresh the page before trying again."));
                }))
            .headers(headers -> headers.contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")))
            .formLogin(config -> config.disable()).httpBasic(config -> config.disable()).logout(config -> config.disable());
        return http.build();
    }
}
