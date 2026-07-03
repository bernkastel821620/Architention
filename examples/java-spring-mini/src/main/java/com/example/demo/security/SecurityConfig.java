package com.example.demo.security;

import com.example.demo.user.UserController;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
    private final AuthenticationService authenticationService;
    private final JwtTokenProvider jwtTokenProvider;

    public SecurityConfig(AuthenticationService authenticationService, JwtTokenProvider jwtTokenProvider) {
        this.authenticationService = authenticationService;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    public boolean allowRequest(String path, String token) {
        if (path.startsWith("/public")) {
            return true;
        }
        return jwtTokenProvider.validateToken(token) && authenticationService.hasActiveSession(token);
    }

    public String protectedUserEndpoint() {
        return UserController.class.getSimpleName();
    }
}

