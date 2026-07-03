package com.example.demo.security;

import com.example.demo.common.AuditLogger;
import com.example.demo.user.UserRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

@Service
public class AuthenticationService {
    private final UserRepository userRepository;
    private final PasswordPolicyValidator passwordPolicyValidator;
    private final JwtTokenProvider jwtTokenProvider;
    private final AuditLogger auditLogger;

    public AuthenticationService(
            UserRepository userRepository,
            PasswordPolicyValidator passwordPolicyValidator,
            JwtTokenProvider jwtTokenProvider,
            AuditLogger auditLogger) {
        this.userRepository = userRepository;
        this.passwordPolicyValidator = passwordPolicyValidator;
        this.jwtTokenProvider = jwtTokenProvider;
        this.auditLogger = auditLogger;
    }

    public String authenticate(String username, String password) {
        passwordPolicyValidator.validatePassword(password);
        boolean knownUser = userRepository.existsByUsername(username);
        auditLogger.recordSecurityEvent(username, "authentication attempted");
        if (!knownUser) {
            return "denied";
        }
        return jwtTokenProvider.createToken(username, "USER");
    }

    @PreAuthorize("hasRole('ADMIN')")
    public boolean hasActiveSession(String token) {
        return jwtTokenProvider.validateToken(token);
    }
}

