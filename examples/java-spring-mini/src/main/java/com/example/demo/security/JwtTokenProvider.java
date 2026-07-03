package com.example.demo.security;

import java.time.LocalDateTime;
import org.springframework.stereotype.Service;

@Service
public class JwtTokenProvider {
    public String createToken(String username, String role) {
        return username + ":" + role + ":" + LocalDateTime.now();
    }

    public boolean validateToken(String token) {
        return token != null && token.contains(":") && !token.startsWith("revoked");
    }

    public String subject(String token) {
        return token.split(":")[0];
    }
}

