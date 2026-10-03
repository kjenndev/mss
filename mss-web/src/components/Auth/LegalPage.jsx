import { Link } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { TERMS_VERSION, PRIVACY_VERSION, LEGAL_CONTACT, termsSections, privacySections } from '../../content/registrationLegal';
import Layout from './RegistrationLayout';
export default function LegalPage({
  kind
}) {
  const terms = kind === 'terms';
  return <Layout title={terms ? 'Terms of Service' : 'Privacy Policy'}><Typography color="text.secondary">Version {terms ? TERMS_VERSION : PRIVACY_VERSION}</Typography>{(terms ? termsSections : privacySections).map(section => <Box component="section" key={section.title}><Typography component="h2" variant="h6" sx={{
        mb: 2
      }}>{section.title}</Typography>{section.paragraphs.map((paragraph, i) => <Typography key={i} paragraph sx={{
        lineHeight: 1.8,
        overflowWrap: 'anywhere'
      }}>{paragraph}</Typography>)}</Box>)}<a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a><Link to={terms ? '/privacy' : '/terms'}>{terms ? 'Privacy Policy' : 'Terms of Service'}</Link><Link to="/register">Create account</Link></Layout>;
}
