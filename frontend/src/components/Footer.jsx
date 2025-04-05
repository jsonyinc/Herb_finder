import React from 'react';
import { Box, Typography } from '@mui/material';

function Footer() {
  return (
    <Box sx={{ bgcolor: 'grey.200', p: 2, textAlign: 'center', mt: 'auto' }}>
      <Typography variant="body2">
        © 2025 Herb Finder | All Rights Reserved
      </Typography>
      <Typography variant="body2">
        아로미(ARomi) Inc. | 화성시 봉담읍 수영로 Romi Campus
      </Typography>
      <Typography variant="body2">
        jsonyinc@gmail.com | 개발자: 김 영 | 관리자: 김지연
      </Typography>
    </Box>
  );
}

export default Footer;